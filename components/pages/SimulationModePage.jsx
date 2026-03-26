'use client'
import { useEffect, useMemo, useState } from 'react'
import { Brain, Droplets, Loader2, SlidersHorizontal } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getMLPrediction } from '@/lib/ml-client'
import { getAllCrops } from '@/lib/crops'

const SOIL_OPTIONS = [
  { label: 'Sandy', value: 'Sandy Soil' },
  { label: 'Loamy', value: 'Loamy Soil' },
  { label: 'Clay', value: 'Clay Soil' },
]

const DEFAULTS = {
  fieldId: '',
  soilMoisture: 42,
  temperature: 31,
  humidity: 58,
  rainfall: 18,
  cropType: 'Wheat',
  soilType: 'Loamy Soil',
  fieldArea: 1,
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function buildSimulationWeather({ temperature, humidity, rainfall }) {
  const baseEt0 = clamp(2.5 + temperature * 0.11 + (100 - humidity) * 0.025 - rainfall * 0.015, 2, 8.5)
  const rainWeights = rainfall > 0 ? [0.45, 0.35, 0.2, 0, 0, 0, 0] : [0, 0, 0, 0, 0, 0, 0]

  return {
    current: {
      temperature,
      humidity,
      windSpeed: clamp(6 + temperature * 0.18 - humidity * 0.03, 4, 16),
      condition: rainfall > 40 ? 'Rainy' : rainfall > 10 ? 'Partly Cloudy' : 'Clear Sky',
      icon: rainfall > 40 ? 'Rain' : rainfall > 10 ? 'Cloud' : 'Sun',
    },
    daily: Array.from({ length: 7 }, (_, index) => {
      const tempShift = [2, 1, 1, 0, -1, 1, 0][index]
      const minShift = [6, 6, 7, 7, 6, 6, 7][index]
      const rainSum = Number((rainfall * rainWeights[index]).toFixed(1))

      return {
        date: new Date(Date.now() + index * 86400000).toISOString().split('T')[0],
        tempMax: clamp(temperature + tempShift, 10, 45),
        tempMin: clamp(temperature - minShift, 5, 35),
        rainSum,
        precipitationSum: rainSum,
        windSpeedMax: clamp(10 + index, 8, 20),
        evapotranspiration: Number(clamp(baseEt0 + tempShift * 0.08 - rainSum * 0.01, 2, 9).toFixed(1)),
      }
    }),
  }
}

function buildDayWisePlan(schedule = []) {
  const today = new Date()
  const scheduleByDay = new Map(schedule.map(item => [item.day, item]))

  return Array.from({ length: 7 }, (_, index) => {
    const fallbackDay = index === 0
      ? 'Today'
      : index === 1
        ? 'Tomorrow'
        : new Date(today.getTime() + index * 86400000).toLocaleDateString('en-IN', { weekday: 'long' })
    const match = scheduleByDay.get(fallbackDay)

    return {
      day: fallbackDay,
      action: match ? 'Irrigate' : 'Monitor',
      liters: match?.liters || 0,
      time: match?.time || 'As needed',
      note: match?.reason || 'No irrigation event scheduled for this day',
    }
  })
}

function buildExplanation(inputs, result) {
  if (inputs.soilMoisture < 30 && inputs.temperature > 32) {
    return 'Based on low soil moisture and high temperature, irrigation is recommended within 24 hours.'
  }
  if (inputs.rainfall > 40) {
    return 'Expected rainfall is high, so the plan reduces immediate irrigation and prioritizes monitoring.'
  }
  if (inputs.humidity < 35 && inputs.temperature > 35) {
    return 'Hot, dry conditions increase evapotranspiration, so earlier irrigation is recommended to avoid stress.'
  }
  if (result?.shouldIrrigateNow) {
    return 'Current field conditions suggest a timely irrigation cycle to maintain stable crop moisture.'
  }
  return 'Current conditions look moderate, so the plan spaces irrigation to balance crop demand and water efficiency.'
}

function SliderField({ label, value, min, max, step = 1, onChange, unit }) {
  return (
    <div className="simulation-slider">
      <div className="simulation-slider-head">
        <label>{label}</label>
        <span>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={onChange} />
    </div>
  )
}

export default function SimulationModePage() {
  const cropOptions = useMemo(() => getAllCrops(), [])
  const [fields, setFields] = useState([])
  const [loadingFields, setLoadingFields] = useState(true)
  const [inputs, setInputs] = useState(DEFAULTS)
  const [result, setResult] = useState(null)
  const [dayPlan, setDayPlan] = useState([])
  const [explanation, setExplanation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function loadFields() {
      setLoadingFields(true)
      const { data } = await supabase.from('fields').select('*').order('created_at', { ascending: false })
      if (!active) return

      const nextFields = data || []
      setFields(nextFields)
      if (nextFields[0]) {
        applyField(nextFields[0])
      }
      setLoadingFields(false)
    }

    loadFields()
    return () => { active = false }
  }, [])

  function updateInput(key, value) {
    setInputs(prev => ({ ...prev, [key]: value }))
  }

  function applyField(field) {
    setInputs(prev => ({
      ...prev,
      fieldId: String(field.id),
      soilMoisture: parseFloat(field.soil_moisture) || prev.soilMoisture,
      temperature: parseFloat(field.soil_temperature) || prev.temperature,
      cropType: field.crop_type || prev.cropType,
      soilType: field.soil_type || prev.soilType,
      fieldArea: parseFloat(field.area_hectares) || 1,
    }))
  }

  function handleFieldChange(fieldId) {
    const field = fields.find(item => String(item.id) === fieldId)
    if (!field) return
    applyField(field)
  }

  async function runSimulation() {
    setLoading(true)
    setError('')
    try {
      const crop = cropOptions.find(option => option.name === inputs.cropType) || cropOptions[0]
      const weather = buildSimulationWeather(inputs)
      const soilData = {
        moisture: inputs.soilMoisture,
        soilType: inputs.soilType,
        temperature: inputs.temperature,
        ph: 6.5,
        nitrogen: 40,
        phosphorus: 30,
        potassium: 35,
        growthStage: 'Vegetative',
      }

      const prediction = await getMLPrediction({
        crop,
        soilData,
        weather,
        fieldArea: inputs.fieldArea || 1,
        location: 'Simulation Mode',
      })

      setResult(prediction)
      setDayPlan(buildDayWisePlan(prediction.schedule))
      setExplanation(buildExplanation(inputs, prediction))
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Simulation failed. Please try again.')
      setResult(null)
      setDayPlan([])
      setExplanation('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Simulation Mode</h1>
          <p className="page-sub">Test irrigation outcomes with manual field conditions using the existing prediction flow.</p>
        </div>
      </div>

      <div className="simulation-layout">
        <div className="glass-card">
          <div className="card-header">
            <h3><SlidersHorizontal size={15} style={{ display: 'inline', marginRight: 6 }} />Simulation Inputs</h3>
          </div>

          <div className="form-group" style={{ marginBottom: 18 }}>
            <label>Choose Field</label>
            <select value={inputs.fieldId} onChange={e => handleFieldChange(e.target.value)} disabled={loadingFields || fields.length === 0}>
              {fields.length === 0
                ? <option value="">No saved fields yet</option>
                : fields.map(field => (
                  <option key={field.id} value={field.id}>{field.name} - {field.crop_type} - {field.area_hectares}ha</option>
                ))}
            </select>
          </div>

          <div className="simulation-sliders">
            <SliderField label="Soil Moisture" value={inputs.soilMoisture} min={0} max={100} unit="%" onChange={e => updateInput('soilMoisture', Number(e.target.value))} />
            <SliderField label="Temperature" value={inputs.temperature} min={10} max={45} unit=" deg C" onChange={e => updateInput('temperature', Number(e.target.value))} />
            <SliderField label="Humidity" value={inputs.humidity} min={0} max={100} unit="%" onChange={e => updateInput('humidity', Number(e.target.value))} />
            <SliderField label="Rainfall" value={inputs.rainfall} min={0} max={100} unit=" mm" onChange={e => updateInput('rainfall', Number(e.target.value))} />
          </div>

          <div className="form-row-2" style={{ marginTop: 18 }}>
            <div className="form-group">
              <label>Crop Type</label>
              <select value={inputs.cropType} onChange={e => updateInput('cropType', e.target.value)}>
                {cropOptions.map(crop => <option key={crop.id} value={crop.name}>{crop.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Soil Type</label>
              <select value={inputs.soilType} onChange={e => updateInput('soilType', e.target.value)}>
                {SOIL_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
          </div>

          <button className="btn-primary btn-full" style={{ marginTop: 18 }} onClick={runSimulation} disabled={loading}>
            {loading ? <><Loader2 size={16} className="spin" /> Simulating...</> : <><Brain size={16} /> Simulate Irrigation Plan</>}
          </button>
        </div>

        <div className="recommendation-panel">
          {!result && !loading && !error && (
            <div className="glass-card" style={{ textAlign: 'center', padding: '56px 24px' }}>
              <Brain size={52} style={{ color: 'var(--green)', opacity: 0.3, margin: '0 auto 14px' }} />
              <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Ready to simulate</h3>
              <p style={{ fontSize: 14, color: 'var(--text2)', maxWidth: 420, margin: '0 auto' }}>Adjust the sliders, choose crop and soil type, and run a stable 7-day irrigation simulation.</p>
            </div>
          )}

          {loading && (
            <div className="glass-card" style={{ textAlign: 'center', padding: '56px 24px' }}>
              <Loader2 size={42} className="spin" style={{ color: 'var(--green)', margin: '0 auto 14px' }} />
              <h3 style={{ fontSize: 16, fontWeight: 800 }}>Running simulation</h3>
              <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 8 }}>Using the same irrigation prediction pipeline as the standard flow.</p>
            </div>
          )}

          {error && !loading && (
            <div className="glass-card" style={{ border: '1.5px solid #f5c6c3', background: 'var(--red-light)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--red)', marginBottom: 8 }}>Simulation failed</h3>
              <p style={{ fontSize: 13, color: 'var(--text2)' }}>{error}</p>
            </div>
          )}

          {result && !loading && (
            <>
              <div className="glass-card">
                <div className="card-header">
                  <h3>Simulation Summary</h3>
                  <span className={`urgency-badge urgency-${result.urgency}`}>{result.urgency?.toUpperCase()}</span>
                </div>

                <div style={{ padding: '12px 16px', background: result.shouldIrrigateNow ? 'var(--green-light)' : 'var(--blue-light)', border: `1px solid ${result.shouldIrrigateNow ? 'var(--border)' : '#bfdbfe'}`, borderRadius: 12, marginBottom: 14 }}>
                  <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{result.shouldIrrigateNow ? 'Irrigation recommended now' : 'Immediate irrigation not required'}</p>
                  <p style={{ fontSize: 13, color: 'var(--text2)' }}>Next action: {result.nextIrrigationTime}</p>
                </div>

                <div className="rec-main-grid">
                  <div className="rec-metric">
                    <div className="rec-metric-value">{result.waterAmountLiters?.toLocaleString()}</div>
                    <div className="rec-metric-label">Estimated Water Usage (L)</div>
                  </div>
                  <div className="rec-metric">
                    <div className="rec-metric-value">{result.schedule?.filter(item => item.liters > 0).length || 0}</div>
                    <div className="rec-metric-label">Planned Irrigation Days</div>
                  </div>
                  <div className="rec-metric">
                    <div className="rec-metric-value">{result.efficiencyScore}%</div>
                    <div className="rec-metric-label">Efficiency Score</div>
                  </div>
                </div>

                <div className="simulation-water-saved">
                  <Droplets size={15} />
                  <span>Estimated water saved: {result.waterSaved}</span>
                </div>
              </div>

              <div className="glass-card">
                <div className="card-header">
                  <h3>7-Day Irrigation Plan</h3>
                </div>
                <div className="simulation-plan-list">
                  {dayPlan.map(item => (
                    <div key={item.day} className="simulation-plan-item">
                      <div>
                        <p className="simulation-plan-day">{item.day}</p>
                        <p className="simulation-plan-note">{item.note}</p>
                      </div>
                      <div className="simulation-plan-meta">
                        <span className={item.liters > 0 ? 'irrigate-yes' : 'irrigate-no'}>{item.action}</span>
                        <strong>{item.liters > 0 ? `${item.liters.toLocaleString()} L` : '0 L'}</strong>
                        <span>{item.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-card">
                <div className="card-header">
                  <h3>Why this plan</h3>
                </div>
                <p className="analysis-text" style={{ marginBottom: 12 }}>{explanation}</p>
                <p className="analysis-text">{result.weatherImpact}</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
