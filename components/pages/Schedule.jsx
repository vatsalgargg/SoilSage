'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { generateWeeklyPlan } from '../../lib/irrigation-engine'
import { fetchWeather, geocodeCity } from '../../lib/weather'
<<<<<<< HEAD
import { getAllCrops } from '../../lib/crops'
import { Calendar, Loader2, Droplets, Radar } from 'lucide-react'

function hasSensorData(field) {
  return [field?.soil_moisture, field?.soil_ph, field?.soil_temperature, field?.nitrogen, field?.phosphorus, field?.potassium]
    .some(value => value !== null && value !== undefined && value !== '')
}
=======
import { getAllCrops, CROP_DATABASE, SOIL_TYPES, GROWTH_STAGES } from '../../lib/crops'
import { useTranslation } from '../../lib/i18n'
import { Calendar, Loader2, Droplets } from 'lucide-react'
>>>>>>> upstream/main

export default function Schedule() {
  const { t } = useTranslation()
  const [fields, setFields] = useState([])
  const [selected, setSelected] = useState(null)
  const [plan, setPlan] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingFields, setLoadingFields] = useState(true)

  useEffect(() => {
    supabase.from('fields').select('*').then(({ data }) => {
      const sensorFields = (data || []).filter(hasSensorData)
      setFields(sensorFields)
      if (sensorFields[0]) setSelected(sensorFields[0])
      setLoadingFields(false)
    })
  }, [])

  async function generate() {
    if (!selected) return
    setLoading(true)
    try {
      const geo = await geocodeCity(selected.location || 'New Delhi')
      const weather = await fetchWeather(geo?.latitude || 28.6, geo?.longitude || 77.2)
<<<<<<< HEAD
      const crop = getAllCrops().find(item => item.name === selected.crop_type) || { name: selected.crop_type, waterNeed: 'medium' }
      const weekPlan = generateWeeklyPlan({
        crop,
        soilData: {
          moisture: selected.soil_moisture || 60,
          soilType: selected.soil_type || 'Loamy Soil',
          growthStage: selected.growth_stage || 'Vegetative',
          temperature: selected.soil_temperature || 25,
          ph: selected.soil_ph || 6.5,
          nitrogen: selected.nitrogen || 40,
          phosphorus: selected.phosphorus || 30,
          potassium: selected.potassium || 35,
        },
        weather,
        fieldArea: selected.area_hectares || 1,
      })
=======
      const allCrops = getAllCrops()
      const crop = allCrops.find(c => c.name === selected.crop_type) || { name: selected.crop_type, waterNeed: 'medium' }
      const weekPlan = generateWeeklyPlan({ crop, soilData: { moisture: selected.soil_moisture || 60, soilType: selected.soil_type || 'Loamy Soil', growthStage: selected.growth_stage || 'Vegetative' }, weather, fieldArea: selected.area_hectares || 1 })
>>>>>>> upstream/main
      setPlan(weekPlan)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const totalWater = plan.reduce((sum, day) => sum + (day.irrigate ? day.liters : 0), 0)
  const irrigateDays = plan.filter(day => day.irrigate).length

  return (
    <div className="page">
      <div className="page-header">
<<<<<<< HEAD
        <div>
          <h1 className="page-title">7-Day Sensor Schedule</h1>
          <p className="page-sub">Sensor-based irrigation planning for fields with measured soil values. For farmers without sensors, use the separate Without Sensors page.</p>
        </div>
=======
        <div><h1 className="page-title">{t('scheduleTitle')}</h1><p className="page-sub">{t('scheduleSub')}</p></div>
>>>>>>> upstream/main
      </div>
      <div className="schedule-layout">
        <div className="glass-card">
<<<<<<< HEAD
          <div className="card-header"><h3>Select Sensor Field</h3></div>
=======
          <div className="card-header"><h3>{t('selectFieldLabel')}</h3></div>
>>>>>>> upstream/main
          {loadingFields ? <div className="center-loader"><Loader2 size={24} className="spin" /></div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {fields.map(field => (
                <div key={field.id} className="field-mini-item" style={{ cursor: 'pointer', border: selected?.id === field.id ? '1px solid var(--green)' : '1px solid transparent' }} onClick={() => setSelected(field)}>
                  <div className="field-mini-info">
                    <span className="field-mini-name">{field.name}</span>
                    <span className="field-mini-crop">{field.crop_type} · {field.area_hectares}ha</span>
                  </div>
                  <div className="planner-mode-badge compact sensor"><Radar size={12} /> Sensor</div>
                </div>
              ))}
<<<<<<< HEAD
              {fields.length === 0 && <p style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'center' }}>No sensor-based fields yet. Add one in My Fields or use the Without Sensors page.</p>}
=======
              {fields.length === 0 && <p style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'center' }}>{t('noFields')}</p>}
>>>>>>> upstream/main
            </div>
          )}
          <button className="btn-primary btn-full" onClick={generate} disabled={loading || !selected}>
            {loading ? <><Loader2 size={16} className="spin" /> {t('generating')}</> : <><Calendar size={16} /> {t('generatePlan')}</>}
          </button>
          {plan.length > 0 && (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="rec-metric" style={{ textAlign: 'center' }}><div className="rec-metric-value">{irrigateDays}/7</div><div className="rec-metric-label">{t('irrigationDays')}</div></div>
              <div className="rec-metric" style={{ textAlign: 'center' }}><div className="rec-metric-value">{totalWater.toLocaleString()}</div><div className="rec-metric-label">{t('totalLitres')}</div></div>
            </div>
          )}
        </div>

        <div className="glass-card">
<<<<<<< HEAD
          <div className="card-header"><h3>Weekly Schedule</h3><span className="badge-green">Sensor-based</span></div>
          {plan.length === 0 ? (
            <div className="empty-state" style={{ padding: '48px 0' }}>
              <Calendar size={44} />
              <p>Generate a schedule to see the 7-day irrigation plan for your sensor-enabled field.</p>
            </div>
          ) : (
            <div className="history-table-wrap">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>ET0 (mm)</th>
                    <th>ETc (mm)</th>
                    <th>Rain (mm)</th>
                    <th>Net Irr (mm)</th>
                    <th>Litres</th>
                    <th>Temp</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.map(day => (
                    <tr key={day.dateKey}>
                      <td style={{ fontWeight: 600 }}>{day.date}</td>
                      <td style={{ fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{day.et0}</td>
                      <td style={{ fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{day.etc}</td>
                      <td style={{ color: Number(day.rain) > 0 ? 'var(--blue)' : 'var(--text3)' }}>{Number(day.rain) > 0 ? day.rain : '—'}</td>
                      <td style={{ fontFamily: 'var(--mono)', color: parseFloat(day.netIrrigation) > 0 ? 'var(--green)' : 'var(--text3)' }}>{day.netIrrigation}</td>
                      <td style={{ fontWeight: 700 }}>{day.irrigate ? day.liters?.toLocaleString() : '—'}</td>
                      <td style={{ color: 'var(--text2)' }}>{day.tempMax}C / {day.tempMin}C</td>
                      <td>{day.irrigate ? <span className="irrigate-yes"><Droplets size={11} style={{ display: 'inline' }} /> Irrigate</span> : <span className="irrigate-no">Hold</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
=======
          <div className="card-header"><h3>{t('weeklySchedule')}</h3><span className="badge-green">{t('etcBased')}</span></div>
          {plan.length === 0 ? (
            <div className="empty-state" style={{ padding: '48px 0' }}><Calendar size={44} /><p>{t('generatePrompt')}</p></div>
          ) : (
            <>
              <div className="history-table-wrap">
                <table className="history-table">
                  <thead><tr><th>{t('date')}</th><th>{t('et0')}</th><th>{t('etc')}</th><th>{t('rain')}</th><th>{t('netIrrCol')}</th><th>{t('waterCol')}</th><th>{t('temp')}</th><th>{t('action')}</th></tr></thead>
                  <tbody>
                    {plan.map((d, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{d.date}</td>
                        <td style={{ fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{d.et0}</td>
                        <td style={{ fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{d.etc}</td>
                        <td style={{ color: d.rain > 0 ? 'var(--blue)' : 'var(--text3)' }}>{d.rain > 0 ? `🌧️ ${d.rain}` : '—'}</td>
                        <td style={{ fontFamily: 'var(--mono)', color: parseFloat(d.netIrrigation) > 0 ? 'var(--green)' : 'var(--text3)' }}>{d.netIrrigation}</td>
                        <td style={{ fontWeight: 700 }}>{d.irrigate ? d.liters?.toLocaleString() : '—'}</td>
                        <td style={{ color: 'var(--text2)' }}>{d.tempMax}° / {d.tempMin}°</td>
                        <td>{d.irrigate ? <span className="irrigate-yes"><Droplets size={11} style={{ display: 'inline' }} /> {t('irrigate')}</span> : <span className="irrigate-no">{t('hold')}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(0,232,122,0.06)', borderRadius: 10, fontSize: 13, color: 'var(--text2)' }}>
                <strong style={{ color: 'var(--green)' }}>{t('methodology')}</strong> Net irrigation = ETc − Effective Rain (75%) · ETc = Kc × ET₀ (FAO-56 Penman-Monteith)
              </div>
            </>
>>>>>>> upstream/main
          )}
        </div>
      </div>
    </div>
  )
}
