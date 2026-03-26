'use client'
import { useEffect, useMemo, useState } from 'react'
import { Brain, Calendar, CloudRain, Droplets, Loader2, MapPin, RefreshCcw, Thermometer, Wind, Wheat, WifiOff } from 'lucide-react'
import { CROP_DATABASE, GROWTH_STAGES, SOIL_TYPES, getAllCrops } from '../../lib/crops'
import { buildSoilDataProfile, computeIrrigationRecommendation, generateWeeklyPlan, rebalancePlanWithLogs, summarizeIrrigationPattern } from '../../lib/irrigation-engine'
import { fetchWeather, geocodeCity } from '../../lib/weather'

const STORAGE_KEY = 'soilsage-no-sensor-planner-v1'

const SOIL_PROFILES = [
  { match: ['punjab', 'haryana', 'uttar pradesh', 'bihar', 'west bengal', 'assam'], soil: 'Alluvial Soil', note: 'River-basin plains in this belt are commonly alluvial and moisture-retentive.' },
  { match: ['maharashtra', 'madhya pradesh', 'gujarat', 'telangana'], soil: 'Black Soil (Regur)', note: 'This region often has black cotton soil that holds water for longer.' },
  { match: ['karnataka', 'tamil nadu', 'kerala', 'andhra pradesh', 'odisha', 'jharkhand', 'chhattisgarh'], soil: 'Red Laterite Soil', note: 'Large parts of peninsular India have red or lateritic soils with moderate water holding.' },
  { match: ['rajasthan'], soil: 'Sandy Soil', note: 'Dry western districts are frequently sandy and need lighter, more frequent irrigation.' },
  { match: ['himachal', 'uttarakhand', 'jammu', 'kashmir', 'meghalaya', 'nagaland', 'manipur', 'mizoram', 'tripura', 'sikkim', 'arunachal'], soil: 'Loamy Soil', note: 'Hill regions often behave closer to loamy mixed soils for planning purposes.' },
]

function defaultForm() {
  return {
    city: '',
    crop_type: '',
    growth_stage: 'Vegetative',
    area_hectares: '1',
    days_since_irrigation: '2',
    irrigation_method: 'Drip',
    manual_soil_override: '',
    notes: '',
  }
}

function inferSoilFromLocation(locationName = '') {
  const label = locationName.toLowerCase()
  const profile = SOIL_PROFILES.find(item => item.match.some(fragment => label.includes(fragment)))
  if (profile) return profile
  return { soil: 'Loamy Soil', note: 'Using loamy soil as a safe default when the city-level soil profile is uncertain.' }
}

function adjustEstimatedMoisture(baseMoisture, daysSinceIrrigation, weather) {
  const days = Number(daysSinceIrrigation) || 0
  const rain3day = weather?.daily?.slice(0, 3).reduce((sum, day) => sum + (Number(day.rainSum) || 0), 0) || 0
  const heat = Number(weather?.current?.temperature) || 30
  const dryDown = days * (heat > 34 ? 6 : heat > 30 ? 4 : 3)
  const rainBoost = rain3day > 20 ? 8 : rain3day > 10 ? 4 : rain3day > 5 ? 2 : 0
  return Math.max(20, Math.min(85, Math.round(baseMoisture - dryDown + rainBoost)))
}

export default function NoSensorPlanner() {
  const [form, setForm] = useState(defaultForm())
  const [logs, setLogs] = useState([])
  const [weather, setWeather] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [plan, setPlan] = useState([])
  const [pattern, setPattern] = useState(null)
  const [loading, setLoading] = useState(false)
  const [savingLog, setSavingLog] = useState(false)
  const [error, setError] = useState('')
  const [logForm, setLogForm] = useState({ water_liters: '', duration_minutes: '', notes: '' })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return

    try {
      const saved = JSON.parse(raw)
      if (saved.form) setForm({ ...defaultForm(), ...saved.form })
      if (saved.logs) setLogs(saved.logs)
    } catch {}
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ form, logs }))
  }, [form, logs])

  const inferredSoil = useMemo(() => inferSoilFromLocation(analysis?.locationName || form.city), [analysis?.locationName, form.city])
  const activeSoil = analysis?.soilType || form.manual_soil_override || inferredSoil.soil

  async function generatePlan(e) {
    e?.preventDefault?.()
    setLoading(true)
    setError('')

    try {
      const geo = await geocodeCity(form.city)
      if (!geo) throw new Error('City not found. Please enter a district or city name.')

      const weatherData = await fetchWeather(geo.latitude, geo.longitude)
      const crop = getAllCrops().find(item => item.name === form.crop_type) || { name: form.crop_type, waterNeed: 'medium', optimalMoisture: 60 }
      const soilType = form.manual_soil_override || inferSoilFromLocation(geo.name || form.city).soil

      const profiledSoil = buildSoilDataProfile({
        crop,
        soilData: {
          moisture: null,
          soilType,
          growthStage: form.growth_stage,
        },
        weather: weatherData,
      })

      const adjustedMoisture = adjustEstimatedMoisture(profiledSoil.moisture, form.days_since_irrigation, weatherData)
      const soilData = {
        moisture: adjustedMoisture,
        soilType,
        growthStage: form.growth_stage,
        temperature: weatherData.current.temperature,
        ph: 6.7,
        nitrogen: 35,
        phosphorus: 28,
        potassium: 34,
      }

      const recommendation = computeIrrigationRecommendation({
        crop,
        soilData,
        weather: weatherData,
        fieldArea: parseFloat(form.area_hectares) || 1,
        location: geo.name,
      })
      const weeklyPlan = generateWeeklyPlan({
        crop,
        soilData,
        weather: weatherData,
        fieldArea: parseFloat(form.area_hectares) || 1,
      })
      const planWithLogs = rebalancePlanWithLogs(weeklyPlan, logs, parseFloat(form.area_hectares) || 1)

      setWeather(weatherData)
      setAnalysis({
        ...recommendation,
        cropName: crop.name,
        locationName: geo.name,
        soilType,
        estimatedMoisture: adjustedMoisture,
        soilNote: inferSoilFromLocation(geo.name || form.city).note,
      })
      setPlan(planWithLogs)
      setPattern(summarizeIrrigationPattern(planWithLogs, crop, soilData))
    } catch (err) {
      setError(err?.message || 'Could not generate the no-sensor plan.')
      setAnalysis(null)
      setPlan([])
      setPattern(null)
    } finally {
      setLoading(false)
    }
  }

  async function saveLog(e) {
    e.preventDefault()
    setSavingLog(true)
    const entry = {
      id: `${Date.now()}`,
      irrigated_at: new Date().toISOString(),
      water_liters: Number(logForm.water_liters) || 0,
      duration_minutes: Number(logForm.duration_minutes) || 0,
      notes: logForm.notes,
    }
    const nextLogs = [entry, ...logs].slice(0, 30)
    setLogs(nextLogs)
    setLogForm({ water_liters: '', duration_minutes: '', notes: '' })
    setSavingLog(false)

    if (analysis) {
      const syntheticEvent = { preventDefault() {} }
      setTimeout(() => generatePlan(syntheticEvent), 0)
    }
  }

  const totalAdjusted = plan.reduce((sum, day) => sum + (day.adjustedLiters || 0), 0)
  const totalActual = plan.reduce((sum, day) => sum + (day.actualLiters || 0), 0)
  const remaining = Math.max(0, totalAdjusted - totalActual)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Without Sensors</h1>
          <p className="page-sub">A dedicated planner for farmers who only know their city, crop, field size, and recent irrigation activity.</p>
        </div>
      </div>

      <div className="advisor-layout">
        <div className="glass-card advisor-input">
          <div className="card-header"><h3>No-Sensor Input</h3></div>
          <form className="modal-form" style={{ padding: 0 }} onSubmit={generatePlan}>
            <div className="planner-helper-card" style={{ marginBottom: 14 }}>
              <p className="planner-helper-title">What we ask the farmer</p>
              <p className="planner-helper-text">Only simple details: city, crop, field size, crop stage, and how recently the field was irrigated. The app estimates weather and general soil behaviour from that.</p>
            </div>

            <div className="form-group">
              <label>City / District *</label>
              <input value={form.city} onChange={e => setForm(current => ({ ...current, city: e.target.value }))} placeholder="e.g. Nashik, Maharashtra" required />
            </div>

            <div className="form-group">
              <label>Crop *</label>
              <select value={form.crop_type} onChange={e => setForm(current => ({ ...current, crop_type: e.target.value }))} required>
                <option value="">Select Crop</option>
                {Object.entries(CROP_DATABASE).map(([key, category]) => (
                  <optgroup key={key} label={category.label}>
                    {category.crops.map(crop => <option key={crop.id} value={crop.name}>{crop.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label>Field Size (ha)</label>
                <input type="number" min="0.1" step="0.1" value={form.area_hectares} onChange={e => setForm(current => ({ ...current, area_hectares: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Growth Stage</label>
                <select value={form.growth_stage} onChange={e => setForm(current => ({ ...current, growth_stage: e.target.value }))}>
                  {GROWTH_STAGES.map(stage => <option key={stage}>{stage}</option>)}
                </select>
              </div>
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label>Days Since Last Irrigation</label>
                <input type="number" min="0" max="14" value={form.days_since_irrigation} onChange={e => setForm(current => ({ ...current, days_since_irrigation: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Irrigation Method</label>
                <select value={form.irrigation_method} onChange={e => setForm(current => ({ ...current, irrigation_method: e.target.value }))}>
                  <option>Drip</option>
                  <option>Sprinkler</option>
                  <option>Flood</option>
                  <option>Furrow</option>
                  <option>Manual Bucket / Pipe</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Soil Type Override (optional)</label>
              <select value={form.manual_soil_override} onChange={e => setForm(current => ({ ...current, manual_soil_override: e.target.value }))}>
                <option value="">Auto-detect from city</option>
                {SOIL_TYPES.map(soil => <option key={soil.id} value={soil.name}>{soil.name}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Farmer Notes (optional)</label>
              <textarea rows={2} value={form.notes} onChange={e => setForm(current => ({ ...current, notes: e.target.value }))} placeholder="e.g. Water source is limited, usually irrigate only in evening" />
            </div>

            <button className="btn-primary btn-full" type="submit" disabled={loading}>
              {loading ? <><Loader2 size={16} className="spin" /> Calculating...</> : <><Brain size={16} /> Generate No-Sensor Guidance</>}
            </button>
          </form>

          {error && <div className="auth-error" style={{ marginTop: 14 }}>{error}</div>}

          {analysis && (
            <div className="planner-detail-list" style={{ marginTop: 16 }}>
              <p><strong>Detected Soil:</strong> {activeSoil}</p>
              <p><strong>Estimated Soil Moisture:</strong> {analysis.estimatedMoisture}%</p>
              <p><strong>Method Advice:</strong> {form.irrigation_method}</p>
              <p><strong>Location Used:</strong> {analysis.locationName}</p>
            </div>
          )}
        </div>

        <div className="recommendation-panel">
          {!analysis && !loading && (
            <div className="glass-card" style={{ textAlign: 'center', padding: '60px 24px' }}>
              <WifiOff size={56} style={{ color: 'var(--amber)', opacity: 0.4, margin: '0 auto 16px' }} />
              <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Dedicated Page For Farmers Without Sensors</h3>
              <p style={{ fontSize: 14, color: 'var(--text2)', maxWidth: 420, margin: '0 auto' }}>This page estimates weather, general soil behaviour, and irrigation timing using only farmer-available information.</p>
            </div>
          )}

          {analysis && (
            <>
              <div className="schedule-summary-grid">
                <div className="rec-metric"><div className="rec-metric-value">{analysis.urgency?.toUpperCase()}</div><div className="rec-metric-label">Priority</div></div>
                <div className="rec-metric"><div className="rec-metric-value">{remaining.toLocaleString()}</div><div className="rec-metric-label">Still To Apply</div></div>
                <div className="rec-metric"><div className="rec-metric-value">{pattern?.sessionsPerWeek || 0}</div><div className="rec-metric-label">Sessions This Week</div></div>
                <div className="rec-metric"><div className="rec-metric-value">{analysis.waterAmountLiters?.toLocaleString()}</div><div className="rec-metric-label">Weekly Need (L)</div></div>
              </div>

              <div className="glass-card">
                <div className="card-header"><h3>Estimated Farm Context</h3><span className="badge-green">No sensors</span></div>
                <div className="planner-guidance">
                  <p><strong>City:</strong> {analysis.locationName}</p>
                  <p><strong>General Soil Inference:</strong> {activeSoil}</p>
                  <p><strong>Why this soil:</strong> {analysis.soilNote}</p>
                  <p><strong>Estimated starting moisture:</strong> {analysis.estimatedMoisture}% after considering recent irrigation and weather.</p>
                  <p><strong>Irrigation decision:</strong> {analysis.shouldIrrigateNow ? 'Irrigate now or in the next early morning window.' : 'Hold irrigation for now and monitor forecast/rain.'}</p>
                </div>
              </div>

              {weather && (
                <div className="glass-card">
                  <div className="card-header"><h3>Weather Used</h3></div>
                  <div className="weather-details">
                    <div className="weather-detail"><Thermometer size={13} />{weather.current.temperature} C</div>
                    <div className="weather-detail"><Droplets size={13} />{weather.current.humidity}% Humidity</div>
                    <div className="weather-detail"><CloudRain size={13} />{weather.current.rain} mm Rain</div>
                    <div className="weather-detail"><Wind size={13} />{weather.current.windSpeed} km/h Wind</div>
                  </div>
                </div>
              )}

              <div className="glass-card">
                <div className="card-header"><h3>Advice</h3></div>
                <div className="planner-guidance">
                  <p><strong>Next irrigation:</strong> {analysis.nextIrrigationTime}</p>
                  <p><strong>Water to apply:</strong> {analysis.waterAmountLiters?.toLocaleString()} litres for the week, adjusted through {pattern?.sessionsPerWeek || 0} likely sessions.</p>
                  <p><strong>Crop advice:</strong> {analysis.cropSpecificAdvice}</p>
                  <p><strong>Weather impact:</strong> {analysis.weatherImpact}</p>
                  <p><strong>Soil note:</strong> {analysis.soilAnalysis}</p>
                  <p><strong>Method suggestion:</strong> {analysis.method}</p>
                </div>
              </div>

              <div className="glass-card">
                <div className="card-header"><h3>Weekly Pattern</h3></div>
                <p className="analysis-text" style={{ marginBottom: 12 }}>{pattern?.headline}</p>
                <div className="history-table-wrap">
                  <table className="history-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Weather</th>
                        <th>Planned</th>
                        <th>Logged</th>
                        <th>Adjusted</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.map(day => (
                        <tr key={day.dateKey}>
                          <td style={{ fontWeight: 700 }}>{day.date}</td>
                          <td style={{ color: 'var(--text2)' }}>{day.tempMax}C / {day.tempMin}C · Rain {day.rain}mm</td>
                          <td>{day.plannedLiters > 0 ? `${day.plannedLiters.toLocaleString()}L` : 'Hold'}</td>
                          <td>{day.actualLiters > 0 ? `${day.actualLiters.toLocaleString()}L` : '—'}</td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontWeight: 700 }}>{day.adjustedLiters > 0 ? `${day.adjustedLiters.toLocaleString()}L` : 'Hold'}</span>
                              <span style={{ fontSize: 11, color: 'var(--text2)' }}>{day.recommendation}</span>
                            </div>
                          </td>
                          <td><span className={`schedule-status schedule-status-${day.status}`}>{day.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="glass-card">
                <div className="card-header"><h3>Log Actual Irrigation</h3></div>
                <form className="modal-form" style={{ padding: 0 }} onSubmit={saveLog}>
                  <div className="form-row-2">
                    <div className="form-group">
                      <label>Water Applied Today (L)</label>
                      <input type="number" min="1" value={logForm.water_liters} onChange={e => setLogForm(current => ({ ...current, water_liters: e.target.value }))} required />
                    </div>
                    <div className="form-group">
                      <label>Duration (min)</label>
                      <input type="number" min="1" value={logForm.duration_minutes} onChange={e => setLogForm(current => ({ ...current, duration_minutes: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>What happened today?</label>
                    <textarea rows={2} value={logForm.notes} onChange={e => setLogForm(current => ({ ...current, notes: e.target.value }))} placeholder="e.g. Could only irrigate half the field because power was cut" />
                  </div>
                  <button className="btn-primary btn-full" type="submit" disabled={savingLog}>
                    {savingLog ? <><Loader2 size={16} className="spin" /> Saving...</> : <><RefreshCcw size={16} /> Save And Recalculate</>}
                  </button>
                </form>
              </div>

              {logs.length > 0 && (
                <div className="glass-card">
                  <div className="card-header"><h3>Farmer Log History</h3></div>
                  <div className="history-table-wrap">
                    <table className="history-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Water</th>
                          <th>Duration</th>
                          <th>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logs.map(log => (
                          <tr key={log.id}>
                            <td>{new Date(log.irrigated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                            <td>{Number(log.water_liters).toLocaleString()}L</td>
                            <td>{log.duration_minutes || '—'} min</td>
                            <td style={{ color: 'var(--text2)' }}>{log.notes || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
