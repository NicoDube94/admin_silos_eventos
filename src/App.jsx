import { useEffect, useRef, useState } from 'react'
import {
  ArrowDownUp,
  Bell,
  CakeSlice,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  UserRoundX,
  UsersRound,
  X,
} from 'lucide-react'
import initialClients from './mockData.json'
import initialSettings from './mockSettings.json'
import SettingsPanel from './components/SettingsPanel.jsx'
import { api } from './services/api.js'
import './App.css'

const dateFormatter = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' })
const notificationDateFormatter = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' })
const dismissedNotificationsStorageKey = 'silos-eventos-dismissed-notifications'

function getBirthdayDetails(dateString) {
  const [, month, day] = dateString.split('-').map(Number)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let nextBirthday = new Date(today.getFullYear(), month - 1, day)

  if (nextBirthday < today) nextBirthday = new Date(today.getFullYear() + 1, month - 1, day)
  const daysUntil = Math.round((nextBirthday - today) / 86400000)
  return {
    daysUntil,
    dateLabel: dateFormatter.format(new Date(2000, month - 1, day)),
    relativeLabel: daysUntil === 0 ? 'Hoy' : daysUntil === 1 ? 'Mañana' : `En ${daysUntil} días`,
  }
}

function getInitials(name) {
  return name.split(' ').slice(0, 2).map((part) => part[0]).join('')
}

function formatNotificationDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : notificationDateFormatter.format(date)
}

function getSavedDismissedNotifications() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(dismissedNotificationsStorageKey) || '[]')
    return new Set(Array.isArray(saved) ? saved.map(String) : [])
  } catch {
    return new Set()
  }
}

function formatNotificationMessage(notification) {
  return (notification.cuerpoMensaje || 'No hay contenido de plantilla guardado para este aviso.')
    .replaceAll('{{nombre_tutor}}', notification.tutor)
    .replaceAll('{{nombre_cumpleanero}}', notification.cumpleanero)
}

function getSavedTheme() {
  try {
    return window.localStorage.getItem('silos-eventos-theme') === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function formatDateInput(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function BirthdayCalendar({ clients, onAddClient }) {
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return today
  })
  const year = selectedDate.getFullYear()
  const month = selectedDate.getMonth()
  const monthStart = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const leadingDays = (monthStart.getDay() + 6) % 7
  const cellCount = Math.ceil((leadingDays + daysInMonth) / 7) * 7
  const calendarDays = Array.from({ length: cellCount }, (_, index) => {
    const day = index - leadingDays + 1
    return day > 0 && day <= daysInMonth ? day : null
  })
  const birthdaysByDay = new Map()

  clients.forEach((client) => {
    const [, birthMonth, birthDay] = client.fechaNacimiento.split('-').map(Number)
    if (birthMonth !== month + 1) return
    birthdaysByDay.set(birthDay, [...(birthdaysByDay.get(birthDay) ?? []), client])
  })

  const selectedBirthdays = birthdaysByDay.get(selectedDate.getDate()) ?? []
  const monthLabel = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(monthStart)
  const selectedDateLabel = new Intl.DateTimeFormat('es-AR', { dateStyle: 'full' }).format(selectedDate)
  const todayValue = formatDateInput(new Date())

  function changeMonth(offset) {
    setSelectedDate((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1))
  }

  function selectDate(value) {
    if (!value) return
    const [dateYear, dateMonth, dateDay] = value.split('-').map(Number)
    setSelectedDate(new Date(dateYear, dateMonth - 1, dateDay))
  }

  return (
    <div className="dashboard-content birthday-content">
      <section className="calendar-page-heading">
        <div><div className="eyebrow"><span /> CALENDARIO</div><h1>Cumpleaños</h1><p>Fechas agendadas de clientes activos.</p></div>
        <button className="primary-button" type="button" onClick={onAddClient}><Plus size={17} /><span>Nuevo cliente</span></button>
      </section>
      <section className="birthday-calendar panel" id="upcoming" aria-label="Calendario de cumpleaños">
        <div className="calendar-toolbar">
          <div className="calendar-month-controls">
            <button className="icon-button" type="button" title="Mes anterior" aria-label="Mes anterior" onClick={() => changeMonth(-1)}><ChevronLeft size={19} /></button>
            <h2>{monthLabel}</h2>
            <button className="icon-button" type="button" title="Mes siguiente" aria-label="Mes siguiente" onClick={() => changeMonth(1)}><ChevronRight size={19} /></button>
          </div>
          <div className="calendar-date-controls">
            <button className="calendar-today-button" type="button" onClick={() => selectDate(todayValue)}>Hoy</button>
            <label className="calendar-date-jump" title="Ir a una fecha">
              <CalendarDays size={16} />
              <input type="date" aria-label="Ir a una fecha" value={formatDateInput(selectedDate)} onChange={(event) => selectDate(event.target.value)} />
            </label>
          </div>
        </div>
        <div className="calendar-layout">
          <div className="calendar-main">
            <div className="calendar-weekdays" aria-hidden="true">
              {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((weekday) => <span key={weekday}>{weekday}</span>)}
            </div>
            <div className="calendar-grid" role="grid" aria-label={`Días de ${monthLabel}`}>
              {calendarDays.map((day, index) => {
                if (day === null) return <span className="calendar-day calendar-day-empty" role="presentation" key={`empty-${index}`} />
                const dayDate = new Date(year, month, day)
                const dateValue = formatDateInput(dayDate)
                const birthdays = birthdaysByDay.get(day) ?? []
                const isSelected = dateValue === formatDateInput(selectedDate)
                const isToday = dateValue === todayValue
                return (
                  <button
                    className={`calendar-day ${birthdays.length ? 'calendar-day-has-birthdays' : ''} ${isSelected ? 'calendar-day-selected' : ''} ${isToday ? 'calendar-day-today' : ''}`}
                    type="button"
                    role="gridcell"
                    aria-label={`${new Intl.DateTimeFormat('es-AR', { dateStyle: 'full' }).format(dayDate)}${birthdays.length ? `, ${birthdays.length} ${birthdays.length === 1 ? 'cumpleaños agendado' : 'cumpleaños agendados'}` : ''}`}
                    aria-pressed={isSelected}
                    aria-current={isToday ? 'date' : undefined}
                    onClick={() => setSelectedDate(dayDate)}
                    key={dateValue}
                  >
                    <span className="calendar-day-number">{day}</span>
                    {birthdays.length > 0 && <span className="calendar-birthday-count"><CakeSlice size={13} /><span>{birthdays.length}</span></span>}
                  </button>
                )
              })}
            </div>
            <div className="calendar-legend"><span className="calendar-legend-marker"><CakeSlice size={13} /></span><span>Día con cumpleaños agendados</span></div>
          </div>
          <aside className="calendar-day-panel" aria-live="polite">
            <div className="calendar-day-panel-heading">
              <span className="section-kicker">FECHA SELECCIONADA</span>
              <strong>{selectedDateLabel}</strong>
              <span className="calendar-day-total">{selectedBirthdays.length} {selectedBirthdays.length === 1 ? 'cumpleaños agendado' : 'cumpleaños agendados'}</span>
            </div>
            <div className="calendar-birthday-list">
              {selectedBirthdays.map((client, index) => (
                <div className="calendar-birthday-item" key={client.id}>
                  <span className={`client-avatar avatar-tone-${index % 4}`}>{getInitials(client.cumpleanero)}</span>
                  <span className="calendar-birthday-copy"><strong>{client.cumpleanero}</strong><small>{client.tutor}</small></span>
                </div>
              ))}
              {selectedBirthdays.length === 0 && <p className="calendar-empty-day">No hay cumpleaños agendados para esta fecha.</p>}
            </div>
          </aside>
        </div>
      </section>
    </div>
  )
}

function App() {
  const [clients, setClients] = useState(initialClients)
  const [settings, setSettings] = useState(initialSettings.configuracion)
  const [templates, setTemplates] = useState(initialSettings.plantillas)
  const [notifications, setNotifications] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('todos')
  const [activeView, setActiveView] = useState('dashboard')
  const [connectionState, setConnectionState] = useState('connecting')
  const [connectionError, setConnectionError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingClient, setEditingClient] = useState(null)
  const [clientToDeactivate, setClientToDeactivate] = useState(null)
  const [deactivationPending, setDeactivationPending] = useState(false)
  const [toast, setToast] = useState('')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [theme, setTheme] = useState(getSavedTheme)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState(getSavedDismissedNotifications)
  const notificationMenuRef = useRef(null)

  useEffect(() => {
    try {
      window.localStorage.setItem('silos-eventos-theme', theme)
    } catch {
      return
    }
  }, [theme])

  useEffect(() => {
    if (!toast) return undefined
    const timeoutId = window.setTimeout(() => setToast(''), 2800)
    return () => window.clearTimeout(timeoutId)
  }, [toast])

  useEffect(() => {
    if (!notificationsOpen) return undefined
    function closeOnOutsideClick(event) {
      if (!notificationMenuRef.current?.contains(event.target)) setNotificationsOpen(false)
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape') setNotificationsOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [notificationsOpen])

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      try {
        const [, nextClients, nextSettings, nextTemplates, nextNotifications] = await Promise.all([
          api.health(),
          api.clients(),
          api.settings(),
          api.templates(),
          api.notifications(),
        ])
        if (cancelled) return
        setClients(nextClients)
        setSettings(nextSettings)
        setTheme(nextSettings.tema || getSavedTheme())
        setTemplates(nextTemplates)
        setNotifications(nextNotifications)
        setConnectionError('')
        setConnectionState('connected')
      } catch (error) {
        if (cancelled) return
        setConnectionError(error.message)
        setConnectionState('offline')
      }
    }

    void loadData()
    return () => { cancelled = true }
  }, [reloadKey])

  useEffect(() => {
    if (activeView !== 'dashboard' || filter !== 'pendientes') return undefined
    const frameId = window.requestAnimationFrame(() => {
      document.getElementById('clients')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [activeView, filter])

  const activeClients = clients.filter((client) => client.activo)
  const upcomingBirthdays = activeClients
    .map((client) => ({ ...client, birthday: getBirthdayDetails(client.fechaNacimiento) }))
    .sort((first, second) => first.birthday.daysUntil - second.birthday.daysUntil)
  const upcomingThisMonth = upcomingBirthdays.filter((client) => client.birthday.daysUntil <= 30)
  const sentReminders = activeClients.reduce(
    (total, client) => total + client.avisos.filter((status) => status === 'enviado').length,
    0,
  )
  const pendingReminders = activeClients.reduce(
    (total, client) => total + client.avisos.filter((status) => status === 'pendiente').length,
    0,
  )
  const normalizedSearch = search.trim().toLocaleLowerCase('es-AR')
  const visibleClients = upcomingBirthdays.filter((client) => {
    const matchesSearch = [client.tutor, client.cumpleanero, client.telefono]
      .join(' ')
      .toLocaleLowerCase('es-AR')
      .includes(normalizedSearch)
    const matchesFilter = filter === 'todos' || client.avisos.some((status) => status === 'pendiente')
    return matchesSearch && matchesFilter
  })
  const visibleNotifications = notifications.filter(
    (notification) => !dismissedNotificationIds.has(String(notification.id)),
  )
  const monthCounts = Array.from({ length: 6 }, (_, index) => {
    const month = (new Date().getMonth() + index) % 12
    return {
      label: new Intl.DateTimeFormat('es-AR', { month: 'short' })
        .format(new Date(2026, month, 1))
        .replace('.', ''),
      count: activeClients.filter((client) => Number(client.fechaNacimiento.split('-')[1]) - 1 === month).length,
    }
  })
  const maxMonthCount = Math.max(...monthCounts.map((month) => month.count), 1)
  const viewTitles = {
    dashboard: 'Resumen',
    clients: 'Clientes',
    birthdays: 'Cumpleaños',
    settings: 'Ajustes',
  }

  function openCreateModal() {
    setEditingClient(null)
    setModalOpen(true)
  }

  function openEditModal(client) {
    setEditingClient(client)
    setModalOpen(true)
  }

  async function toggleNotifications() {
    const opening = !notificationsOpen
    setNotificationsOpen(opening)
    if (!opening) return

    try {
      setNotifications(await api.notifications())
    } catch (error) {
      setToast(`No se pudieron cargar los avisos: ${error.message}`)
    }
  }

  function dismissNotification(notificationId) {
    const dismissedIds = new Set(dismissedNotificationIds).add(String(notificationId))
    try {
      window.localStorage.setItem(dismissedNotificationsStorageKey, JSON.stringify([...dismissedIds]))
    } catch {
      setToast('No se pudo guardar la lista de avisos descartados en este navegador.')
    }
    setDismissedNotificationIds(dismissedIds)
  }

  function openSettings() {
    setActiveView('settings')
    setMobileMenuOpen(false)
  }

  function handleApiError(error) {
    setToast(`No se pudo guardar: ${error.message}`)
    if (!error.status || error.status === 503) {
      setConnectionError(error.message)
      setConnectionState('offline')
    }
  }

  function retryConnection() {
    setConnectionState('connecting')
    setConnectionError('')
    setReloadKey((current) => current + 1)
  }

  async function saveSettings(nextSettings) {
    try {
      const savedSettings = await api.saveSettings(nextSettings)
      setSettings(savedSettings)
      setToast('Los ajustes se guardaron en la base de datos')
      return savedSettings
    } catch (error) {
      handleApiError(error)
      throw error
    }
  }

  async function saveTheme(nextTheme) {
    setTheme(nextTheme)
    try {
      await api.saveTheme(nextTheme)
      setToast('La preferencia de tema se guardó en la base de datos')
    } catch (error) {
      setToast(`Tema guardado en este navegador; no se pudo guardar en la base: ${error.message}`)
      if (!error.status || error.status === 503) {
        setConnectionError(error.message)
        setConnectionState('offline')
      }
    }
  }

  async function sendManualWhatsAppMessage(clientId, templateId) {
    try {
      const result = await api.sendManualWhatsAppMessage(clientId, templateId)
      return result
    } catch (error) {
      setToast(`No se pudo enviar el mensaje: ${error.message}`)
      if (!error.status || error.status === 503) {
        setConnectionError(error.message)
        setConnectionState('offline')
      }
      throw error
    }
  }

  async function saveTemplate(template) {
    try {
      const result = template.id
        ? await api.updateTemplate(template.id, template)
        : await api.createTemplate(template)
      const { desactivadas = [], ...savedTemplate } = result
      const deactivatedIds = new Set(desactivadas.map((item) => item.id))
      setTemplates((current) => {
        const updated = current.map((item) => deactivatedIds.has(item.id)
          ? { ...item, activa: false }
          : item.id === savedTemplate.id ? savedTemplate : item)
        return template.id ? updated : [savedTemplate, ...updated]
      })
      return { ...savedTemplate, desactivadas }
    } catch (error) {
      handleApiError(error)
      throw error
    }
  }

  async function toggleTemplate(template) {
    try {
      const result = await api.setTemplateActive(template.id, !template.activa)
      const { desactivadas = [], ...updatedTemplate } = result
      const deactivatedIds = new Set(desactivadas.map((item) => item.id))
      setTemplates((current) => current.map((item) => {
        if (deactivatedIds.has(item.id)) return { ...item, activa: false }
        if (item.id === updatedTemplate.id) return updatedTemplate
        if (updatedTemplate.activa && item.numeroAviso === updatedTemplate.numeroAviso) return { ...item, activa: false }
        return item
      }))
      return { ...updatedTemplate, desactivadas }
    } catch (error) {
      handleApiError(error)
      throw error
    }
  }

  async function deleteTemplate(template) {
    try {
      const deletedTemplate = await api.deleteTemplate(template.id)
      setTemplates((current) => current.filter((item) => item.id !== deletedTemplate.id))
      return deletedTemplate
    } catch (error) {
      handleApiError(error)
      throw error
    }
  }

  async function saveClient(formData) {
    try {
      const savedClient = editingClient
        ? await api.updateClient(editingClient.id, formData)
        : await api.createClient(formData)
      setClients((current) => editingClient
        ? current.map((client) => client.id === savedClient.id ? savedClient : client)
        : [...current, savedClient])
      setToast(editingClient ? 'Los datos del cliente se actualizaron' : 'Cliente agregado correctamente')
      setModalOpen(false)
    } catch (error) {
      handleApiError(error)
    }
  }

  function deactivateClient(client) {
    setClientToDeactivate(client)
  }

  async function confirmDeactivation() {
    if (!clientToDeactivate || deactivationPending) return
    const client = clientToDeactivate
    setDeactivationPending(true)
    try {
      await api.deactivateClient(client.id)
      setClients((current) => current.map((item) =>
        item.id === client.id ? { ...item, activo: false } : item,
      ))
      setToast('El cliente se desactivó; el registro se conservó')
      setClientToDeactivate(null)
    } catch (error) {
      handleApiError(error)
    } finally {
      setDeactivationPending(false)
    }
  }

  return (
    <div className="app-shell" id="overview" data-theme={theme}>
      <aside className={`sidebar ${mobileMenuOpen ? 'sidebar-open' : ''} ${sidebarVisible ? '' : 'sidebar-hidden'}`}>
        <a className="brand" href="#overview" onClick={() => { setActiveView('dashboard'); setMobileMenuOpen(false); setSidebarVisible(false) }}>
          <span className="brand-mark"><img src="/icon.svg" alt="" /></span>
          <span className="brand-name">silos<span>eventos</span></span>
        </a>
        <div className="workspace-label">GESTIÓN</div>
        <nav className="primary-nav" aria-label="Navegación principal">
          <a className={`nav-link ${activeView === 'dashboard' ? 'nav-link-active' : ''}`} href="#overview" onClick={() => { setActiveView('dashboard'); setMobileMenuOpen(false) }}><LayoutDashboard size={18} /><span>Resumen</span></a>
          <a className={`nav-link ${activeView === 'clients' ? 'nav-link-active' : ''}`} href="#clients" onClick={() => { setActiveView('clients'); setMobileMenuOpen(false) }}><UsersRound size={18} /><span>Clientes</span><span className="nav-count">{activeClients.length}</span></a>
          <a className={`nav-link ${activeView === 'birthdays' ? 'nav-link-active' : ''}`} href="#upcoming" onClick={() => { setActiveView('birthdays'); setMobileMenuOpen(false) }}><CalendarDays size={18} /><span>Cumpleaños</span></a>
          <button className={`nav-link nav-button ${activeView === 'settings' ? 'nav-link-active' : ''}`} type="button" onClick={openSettings}><Settings size={18} /><span>Ajustes</span></button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note"><span className="note-icon"><Bell size={16} /></span><div><strong>Agenda al día</strong><span>{pendingReminders} avisos pendientes</span></div><span className="online-dot" /></div>
        </div>
      </aside>

      {mobileMenuOpen && <button className="sidebar-backdrop" type="button" aria-label="Cerrar menú" onClick={() => setMobileMenuOpen(false)} />}

      <main className="main-content">
        <header className="topbar">
          <button className={`icon-button mobile-menu-button ${sidebarVisible ? '' : 'menu-restore-visible'}`} type="button" aria-label="Mostrar menú" title="Mostrar menú" onClick={() => { setSidebarVisible(true); setMobileMenuOpen(true) }}><Menu size={20} /></button>
          <div className="breadcrumb"><span>Gestión</span><span className="breadcrumb-divider">/</span><strong>{viewTitles[activeView]}</strong></div>
          <div className="topbar-actions">
            <span className="current-date">{new Intl.DateTimeFormat('es-AR', { dateStyle: 'full' }).format(new Date())}</span>
            <div className="notification-menu" ref={notificationMenuRef}>
              <button className="icon-button notification-button" type="button" title="Avisos enviados" aria-label={visibleNotifications.length ? `${visibleNotifications.length} avisos enviados` : 'Ver avisos enviados'} aria-expanded={notificationsOpen} onClick={toggleNotifications}>
                <Bell size={18} />{visibleNotifications.length > 0 && <span className="notification-dot" />}
              </button>
              {notificationsOpen && <NotificationsPanel notifications={visibleNotifications} onDismiss={dismissNotification} onClose={() => setNotificationsOpen(false)} />}
            </div>
            <button className="icon-button settings-button" type="button" title="Ajustes" aria-label="Abrir ajustes" onClick={openSettings}><Settings size={18} /></button>
            <span className="topbar-avatar">SE</span>
          </div>
        </header>

        {connectionState !== 'connected' && (
          <div className={`connection-banner connection-${connectionState}`} role={connectionState === 'offline' ? 'alert' : 'status'}>
            <span className="connection-indicator" />
            <span className="connection-copy">
              <strong>{connectionState === 'connecting' ? 'Conectando con la API' : 'API sin conexión'}</strong>
              <small>{connectionState === 'connecting' ? 'Cargando clientes y configuración…' : `${connectionError} Se muestran datos de demostración.`}</small>
            </span>
            {connectionState === 'offline' && <button className="icon-button" type="button" title="Reintentar conexión" aria-label="Reintentar conexión con la API" onClick={retryConnection}><RefreshCw size={16} /></button>}
          </div>
        )}

        {activeView === 'settings' ? (
          <SettingsPanel
            key={connectionState}
            settings={settings}
            clients={clients.filter((client) => client.activo)}
            templates={templates}
            onSaveSettings={saveSettings}
            onSendManualMessage={sendManualWhatsAppMessage}
            onSaveTemplate={saveTemplate}
            onToggleTemplate={toggleTemplate}
            onDeleteTemplate={deleteTemplate}
            onToast={setToast}
            theme={theme}
            onThemeChange={saveTheme}
          />
        ) : activeView === 'birthdays' ? (
          <BirthdayCalendar clients={activeClients} onAddClient={openCreateModal} />
        ) : (
        <div className="dashboard-content">
          {activeView !== 'clients' && <section className="page-heading">
            <div><div className="eyebrow"><span /> PANEL GENERAL</div><h1>Agenda de cumpleaños</h1><p>Todo lo importante de tus clientes, en un solo lugar.</p></div>
            <button className="primary-button" type="button" onClick={openCreateModal}><Plus size={17} strokeWidth={2.2} /><span>Nuevo cliente</span></button>
          </section>}

          {activeView !== 'clients' && <section className="metrics-grid" aria-label="Resumen de actividad">
            <article className="metric-card metric-primary"><div className="metric-topline"><span>Clientes activos</span><span className="metric-icon"><UsersRound size={17} /></span></div><div className="metric-value">{activeClients.length}<span className="metric-caption">registros</span></div><div className="metric-foot"><span className="metric-indicator"><span /> Base de clientes</span></div></article>
            <article className="metric-card"><div className="metric-topline"><span>Próximos 30 días</span><span className="metric-icon metric-icon-gold"><CakeSlice size={17} /></span></div><div className="metric-value">{upcomingThisMonth.length}<span className="metric-caption">cumpleaños</span></div><div className="metric-foot"><span className="metric-indicator"><span className="gold-dot" /> En agenda</span></div></article>
            <article className="metric-card"><div className="metric-topline"><span>Avisos enviados</span><span className="metric-icon metric-icon-green"><Check size={17} /></span></div><div className="metric-value">{sentReminders}<span className="metric-caption">este ciclo</span></div><div className="metric-foot"><span className="metric-indicator"><span className="green-dot" /> Seguimiento activo</span></div></article>
            <article className="metric-card"><div className="metric-topline"><span>Avisos pendientes</span><span className="metric-icon metric-icon-peach"><Clock3 size={17} /></span></div><div className="metric-value">{pendingReminders}<span className="metric-caption">por gestionar</span></div><div className="metric-foot"><span className="metric-indicator"><span className="peach-dot" /> Requieren atención</span></div></article>
          </section>}

          <section className={`dashboard-grid ${activeView === 'clients' ? 'clients-only' : ''}`}>
            <section className="panel clients-panel" id="clients">
              <div className="panel-heading clients-heading"><div><div className="section-kicker">{activeView === 'clients' ? 'AGENDA' : 'DIRECTORIO'}</div><h2>{activeView === 'clients' ? 'Clientes agendados' : 'Clientes'}</h2><p>Consulta y administra los registros de cumpleaños.</p></div><button className="text-button" type="button" onClick={openCreateModal}><Plus size={16} /><span>Agregar</span></button></div>
              <div className="table-toolbar">
                <label className="search-field"><Search size={17} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente..." aria-label="Buscar por tutor, cumpleañero o teléfono" />{search && <button type="button" onClick={() => setSearch('')} aria-label="Limpiar búsqueda"><X size={15} /></button>}</label>
                <div className="filter-control" role="group" aria-label="Filtrar clientes"><button className={filter === 'todos' ? 'filter-active' : ''} type="button" onClick={() => setFilter('todos')}>Todos</button><button className={filter === 'pendientes' ? 'filter-active' : ''} type="button" onClick={() => setFilter('pendientes')}>Pendientes</button></div>
              </div>
              <div className="table-scroll">
                <table className="client-table">
                  <thead><tr><th><span>CLIENTE</span><ArrowDownUp size={13} /></th><th>CUMPLEAÑOS</th><th>AVISOS</th><th>ESTADO</th><th><span className="visually-hidden">Acciones</span></th></tr></thead>
                  <tbody>
                    {visibleClients.map((client, index) => {
                      const sentCount = client.avisos.filter((status) => status === 'enviado').length
                      const complete = sentCount === client.avisos.length
                      return <tr key={client.id}>
                        <td><div className="client-cell"><span className={`client-avatar avatar-tone-${index % 4}`}>{getInitials(client.cumpleanero)}</span><span className="client-copy"><strong>{client.cumpleanero}</strong><small>{client.tutor}</small></span></div></td>
                        <td><span className="birthday-date">{client.birthday.dateLabel}</span><small className="birthday-relative">{client.birthday.relativeLabel}</small></td>
                        <td><div className="reminder-progress" aria-label={`${sentCount} de ${client.avisos.length} avisos enviados`}>{client.avisos.map((status, reminderIndex) => <span className={status === 'enviado' ? 'reminder-sent' : ''} key={`${client.id}-${reminderIndex}`} />)}<small>{sentCount}/{client.avisos.length}</small></div></td>
                        <td><span className={`status-badge ${complete ? 'status-complete' : 'status-pending'}`}><span />{complete ? 'Completo' : 'Pendiente'}</span></td>
                        <td><div className="row-actions"><button type="button" title="Editar cliente" aria-label={`Editar a ${client.cumpleanero}`} onClick={() => openEditModal(client)}><Pencil size={15} /></button><button type="button" title="Desactivar cliente" aria-label={`Desactivar a ${client.cumpleanero}`} onClick={() => deactivateClient(client)}><UserRoundX size={16} /></button></div></td>
                      </tr>
                    })}
                    {visibleClients.length === 0 && <tr><td className="empty-state" colSpan="5">No hay clientes que coincidan con la búsqueda.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="table-footer"><span>Mostrando <strong>{visibleClients.length}</strong> de <strong>{activeClients.length}</strong> clientes</span><span className="table-footer-note"><span /> {connectionState === 'connected' ? 'Base de datos' : 'Datos de demostración'}</span></div>
            </section>

            {activeView !== 'clients' && <aside className="right-column">
              <section className="panel upcoming-panel" id="upcoming">
                <div className="panel-heading compact-heading"><div><div className="section-kicker">EN EL CALENDARIO</div><h2>Próximos cumpleaños</h2></div><span className="heading-count">{upcomingBirthdays.length}</span></div>
                <div className="upcoming-list">
                  {upcomingBirthdays.slice(0, 5).map((client, index) => <div className="upcoming-item" key={client.id}>
                    <div className={`upcoming-date upcoming-tone-${index % 3}`}><strong>{client.birthday.dateLabel.split(' ')[0]}</strong><small>{client.birthday.dateLabel.split(' ').slice(1).join(' ').replace('.', '')}</small></div>
                    <div className="upcoming-copy"><strong>{client.cumpleanero}</strong><small>Familia {client.tutor.split(' ').at(-1)}</small></div>
                    <span className={`upcoming-when ${client.birthday.daysUntil <= 7 ? 'upcoming-soon' : ''}`}>{client.birthday.relativeLabel}</span>
                  </div>)}
                  {upcomingBirthdays.length === 0 && <p className="empty-upcoming">Todavía no hay cumpleaños agendados.</p>}
                </div>
              </section>

              <section className="panel activity-panel">
                <div className="panel-heading compact-heading activity-heading"><div><div className="section-kicker">VISTA SEMESTRAL</div><h2>Ritmo de cumpleaños</h2></div><span className="activity-icon"><CalendarDays size={17} /></span></div>
                <div className="chart-area" role="img" aria-label="Cantidad de cumpleaños por mes durante los próximos seis meses">
                  {monthCounts.map((month, index) => <div className="chart-column" key={`${month.label}-${index}`}><span className="chart-count">{month.count || ''}</span><div className="chart-track"><span className={`chart-bar ${index === 0 ? 'chart-bar-current' : ''}`} style={{ height: `${Math.max(8, (month.count / maxMonthCount) * 100)}%` }} /></div><small>{month.label}</small></div>)}
                </div>
                <div className="chart-legend"><span /> Cumpleaños registrados</div>
              </section>
            </aside>}
          </section>
          {activeView !== 'clients' && <footer className="dashboard-footer"><span>Silos Eventos <span className="footer-separator">·</span> Panel de administración</span><span>{connectionState === 'connected' ? 'Conectado a TiDB' : 'Vista previa'} <span className="preview-dot" /></span></footer>}
        </div>
        )}
      </main>

      {modalOpen && <ClientModal client={editingClient} onClose={() => setModalOpen(false)} onSave={saveClient} />}
      {clientToDeactivate && <DeactivateClientModal
        client={clientToDeactivate}
        pending={deactivationPending}
        onClose={() => setClientToDeactivate(null)}
        onConfirm={confirmDeactivation}
      />}
      {toast && <div className="toast-message" role="status"><Check size={17} />{toast}</div>}
    </div>
  )
}

function ClientModal({ client, onClose, onSave }) {
  const [form, setForm] = useState({
    tutor: client?.tutor ?? '',
    telefono: client?.telefono ?? '',
    cumpleanero: client?.cumpleanero ?? '',
    fechaNacimiento: client?.fechaNacimiento ?? '',
  })

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  function submitForm(event) {
    event.preventDefault()
    onSave(form)
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="client-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-heading"><div><span className="modal-icon"><CakeSlice size={19} /></span><div><div className="section-kicker">DIRECTORIO DE CLIENTES</div><h2 id="modal-title">{client ? 'Editar cliente' : 'Nuevo cliente'}</h2></div></div><button className="icon-button" type="button" aria-label="Cerrar" onClick={onClose}><X size={19} /></button></div>
        <p className="modal-intro">Completa los datos para mantener la agenda actualizada.</p>
        <form onSubmit={submitForm}>
          <label className="form-field"><span>Nombre del tutor</span><input autoFocus name="tutor" value={form.tutor} onChange={updateField} placeholder="Ej. Mariana López" required /></label>
          <label className="form-field"><span>Teléfono de WhatsApp</span><input name="telefono" type="tel" value={form.telefono} onChange={updateField} placeholder="+54 9 11 0000 0000" required /></label>
          <div className="form-row"><label className="form-field"><span>Nombre del cumpleañero</span><input name="cumpleanero" value={form.cumpleanero} onChange={updateField} placeholder="Ej. Tomás" required /></label><label className="form-field"><span>Fecha de nacimiento</span><input name="fechaNacimiento" type="date" value={form.fechaNacimiento} onChange={updateField} required /></label></div>
          <div className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancelar</button><button className="primary-button" type="submit"><Check size={16} />{client ? 'Guardar cambios' : 'Agregar cliente'}</button></div>
        </form>
      </section>
    </div>
  )
}

function DeactivateClientModal({ client, pending, onClose, onConfirm }) {
  function handleKeyDown(event) {
    if (event.key === 'Escape' && !pending) onClose()
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !pending && onClose()}>
      <section className="client-modal deactivate-modal" role="alertdialog" aria-modal="true" aria-labelledby="deactivate-title" aria-describedby="deactivate-description" onKeyDown={handleKeyDown}>
        <div className="modal-heading">
          <div>
            <span className="modal-icon deactivate-modal-icon"><UserRoundX size={19} /></span>
            <div><div className="section-kicker">DIRECTORIO DE CLIENTES</div><h2 id="deactivate-title">¿Desactivar a {client.cumpleanero}?</h2></div>
          </div>
          <button className="icon-button" type="button" aria-label="Cerrar" onClick={onClose} disabled={pending}><X size={19} /></button>
        </div>
        <p className="modal-intro" id="deactivate-description">El registro dejará de aparecer entre los clientes activos.</p>
        <div className="deactivate-client-details"><strong>{client.cumpleanero}</strong><span>{client.tutor}</span></div>
        <p className="deactivate-preservation">El registro y su historial se conservarán en la base de datos.</p>
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={pending} autoFocus>Cancelar</button>
          <button className="primary-button danger-button" type="button" onClick={onConfirm} disabled={pending}><UserRoundX size={16} />{pending ? 'Desactivando…' : 'Desactivar cliente'}</button>
        </div>
      </section>
    </div>
  )
}

function NotificationsPanel({ notifications, onDismiss, onClose }) {
  return (
    <section className="notification-panel" role="dialog" aria-labelledby="notifications-title">
      <header className="notification-panel-header">
        <div><div className="section-kicker">HISTORIAL</div><h2 id="notifications-title">Avisos enviados</h2></div>
        <button className="icon-button" type="button" aria-label="Cerrar avisos enviados" onClick={onClose}><X size={17} /></button>
      </header>
      {notifications.length === 0 ? (
        <p className="notification-empty">Todavía no hay avisos enviados.</p>
      ) : (
        <div className="notification-list">
          {notifications.map((notification) => (
            <article className="notification-entry" key={notification.id}>
              <div className="notification-entry-topline">
                <span className="notification-type">Aviso {notification.numeroAviso}</span>
                <div className="notification-entry-actions">
                  <time dateTime={notification.fechaEnvio}>{formatNotificationDate(notification.fechaEnvio)}</time>
                  <button className="icon-button notification-dismiss-button" type="button" aria-label={`Quitar aviso ${notification.numeroAviso} de ${notification.cumpleanero}`} title="Quitar de la lista" onClick={() => onDismiss(notification.id)}><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="notification-recipient"><strong>{notification.cumpleanero}</strong><span>Para {notification.tutor}</span></div>
              <div className="notification-template"><MessageSquareText size={13} /><span>{notification.nombrePlantilla}</span></div>
              <p>{formatNotificationMessage(notification)}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default App
