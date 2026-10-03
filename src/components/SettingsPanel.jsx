import { useLayoutEffect, useRef, useState } from 'react'
import { BellRing, CakeSlice, Check, Clock3, MessageSquareText, Moon, Pencil, Plus, Save, Sun, ToggleLeft, Trash2, UserRound, X } from 'lucide-react'

const templateVariables = {
  nombre_tutor: 'Nombre del tutor',
  nombre_cumpleanero: 'Nombre del cumpleañero',
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character])
}

function createTemplateEditorHtml(message) {
  return escapeHtml(message)
    .replace(/\{\{nombre_tutor\}\}/g, `<span class="template-variable-chip" data-template-variable="nombre_tutor" contenteditable="false">${templateVariables.nombre_tutor}</span>`)
    .replace(/\{\{nombre_cumpleanero\}\}/g, `<span class="template-variable-chip" data-template-variable="nombre_cumpleanero" contenteditable="false">${templateVariables.nombre_cumpleanero}</span>`)
    .replace(/\n/g, '<br>')
}

function serializeTemplateEditor(editor) {
  function serializeNode(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent.replace(/\u00a0/g, ' ')
    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    if (node.dataset.templateVariable) return `{{${node.dataset.templateVariable}}}`
    if (node.tagName === 'BR') return '\n'

    const content = Array.from(node.childNodes, serializeNode).join('')
    return node.tagName === 'DIV' || node.tagName === 'P' ? `${content}\n` : content
  }

  return Array.from(editor.childNodes, serializeNode).join('').replace(/\n+$/, '')
}

function TemplateMessageEditor({ value, onChange }) {
  const editorRef = useRef(null)
  const [initialHtml] = useState(() => createTemplateEditorHtml(value))

  useLayoutEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = initialHtml
  }, [initialHtml])

  function insertVariable(variable) {
    const editor = editorRef.current
    if (!editor) return

    const selection = window.getSelection()
    const range = selection?.rangeCount ? selection.getRangeAt(0) : document.createRange()
    if (!editor.contains(range.startContainer)) {
      range.selectNodeContents(editor)
      range.collapse(false)
    }
    range.deleteContents()

    const chip = document.createElement('span')
    chip.className = 'template-variable-chip'
    chip.dataset.templateVariable = variable
    chip.contentEditable = 'false'
    chip.textContent = templateVariables[variable]
    const space = document.createTextNode('\u00a0')
    range.insertNode(space)
    range.insertNode(chip)
    range.setStartAfter(space)
    range.collapse(true)
    selection?.removeAllRanges()
    selection?.addRange(range)
    editor.focus()
    onChange(serializeTemplateEditor(editor))
  }

  return (
    <>
      <div
        ref={editorRef}
        className="template-message-editor"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label="Mensaje de la plantilla"
        aria-multiline="true"
        data-placeholder="Escribe aquí el mensaje para la familia..."
        onInput={(event) => onChange(serializeTemplateEditor(event.currentTarget))}
      />
      <div className="template-variable-tools" role="group" aria-label="Insertar dato personalizado">
        <span>Insertar dato</span>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertVariable('nombre_tutor')}><UserRound size={14} />Nombre del tutor</button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertVariable('nombre_cumpleanero')}><CakeSlice size={14} />Nombre del cumpleañero</button>
      </div>
    </>
  )
}
function SettingsPanel({ settings, templates, onSaveSettings, onSaveTemplate, onToggleTemplate, onDeleteTemplate, onToast, theme, onThemeChange }) {
  const [settingsDraft, setSettingsDraft] = useState(settings)
  const [templateDraft, setTemplateDraft] = useState(null)
  const [templateToDelete, setTemplateToDelete] = useState(null)
  const [deletionPending, setDeletionPending] = useState(false)

  function updateSetting(event) {
    const { name, value, type } = event.target
    setSettingsDraft((current) => ({ ...current, [name]: type === 'number' ? Number(value) : value }))
  }

  async function saveSettings(event) {
    event.preventDefault()
    try {
      await onSaveSettings(settingsDraft)
    } catch {
      return
    }
  }

  async function saveTemplate(event) {
    event.preventDefault()
    if (!templateDraft.cuerpoMensaje.trim()) {
      onToast('Escribe el mensaje de la plantilla antes de guardarla')
      return
    }
    try {
      const result = await onSaveTemplate(templateDraft)
      if (result.desactivadas?.length) {
        const previousNames = result.desactivadas.map((template) => `"${template.nombreOferta}"`).join(', ')
        onToast(`Aviso ${result.numeroAviso}: quedó activa "${result.nombreOferta}" y se desactivó ${previousNames}`)
      } else {
        onToast(templateDraft.id ? 'La plantilla se actualizó' : 'La plantilla se agregó')
      }
      setTemplateDraft(null)
    } catch {
      return
    }
  }

  async function toggleTemplate(template) {
    try {
      const result = await onToggleTemplate(template)
      if (result.desactivadas?.length) {
        const previousNames = result.desactivadas.map((item) => `"${item.nombreOferta}"`).join(', ')
        onToast(`Aviso ${result.numeroAviso}: quedó activa "${result.nombreOferta}" y se desactivó ${previousNames}`)
      } else {
        onToast(template.activa ? 'La plantilla se desactivó' : 'La plantilla se activó')
      }
    } catch {
      return
    }
  }

  async function deleteTemplate() {
    if (!templateToDelete || deletionPending) return
    setDeletionPending(true)
    try {
      const deleted = await onDeleteTemplate(templateToDelete)
      onToast(`La plantilla "${deleted.nombreOferta}" se eliminó. El historial se conservó.`)
      setTemplateToDelete(null)
    } catch {
      return
    } finally {
      setDeletionPending(false)
    }
  }

  return (
    <div className="dashboard-content settings-content">
      <section className="page-heading">
        <div>
          <div className="eyebrow"><span /> PREFERENCIAS</div>
          <h1>Ajustes del sistema</h1>
          <p>Configura los tiempos de aviso y los mensajes de contacto.</p>
        </div>
      </section>

      <div className="settings-layout">
        <section className="panel settings-panel">
          <div className="settings-section-heading">
            <span className="settings-section-icon"><BellRing size={18} /></span>
            <div><div className="section-kicker">RECORDATORIOS</div><h2>Parámetros de aviso</h2></div>
          </div>
          <form className="settings-form" onSubmit={saveSettings}>
            <label className="form-field"><span>Días de anticipación</span><input name="diasAnticipacion" type="number" min="1" max="365" value={settingsDraft.diasAnticipacion} onChange={updateSetting} required /><small>Cuánto antes del cumpleaños comienza el seguimiento.</small></label>
            <label className="form-field"><span>Cantidad de notificaciones</span><input name="cantidadNotificaciones" type="number" min="1" max="3" value={settingsDraft.cantidadNotificaciones} onChange={updateSetting} required /><small>Entre 1 y 3 avisos por cada festejo.</small></label>
            <label className="form-field"><span>Intervalo entre avisos (días)</span><input name="plazosDias" type="number" min="1" max="90" value={settingsDraft.plazosDias} onChange={updateSetting} required /><small>Separación entre una notificación y la siguiente.</small></label>
            <label className="form-field"><span>Teléfono de administración</span><input name="telefonoAdmin" type="tel" value={settingsDraft.telefonoAdmin} onChange={updateSetting} placeholder="+54 9 11 0000 0000" required /><small>Número de contacto para las notificaciones internas.</small></label>
            <div className="settings-form-footer"><span><Clock3 size={14} /> Cambios guardados en la base de datos</span><button className="primary-button" type="submit"><Save size={16} />Guardar ajustes</button></div>
          </form>
          <section className="settings-theme-section" aria-labelledby="theme-heading">
            <div className="settings-section-heading">
              <span className="settings-section-icon settings-theme-icon">{theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}</span>
              <div><div className="section-kicker">APARIENCIA</div><h2 id="theme-heading">Tema del panel</h2></div>
            </div>
            <div className="theme-control" role="group" aria-label="Tema de la página">
              <button className={theme === 'light' ? 'theme-choice-active' : ''} type="button" aria-pressed={theme === 'light'} onClick={() => onThemeChange('light')}><Sun size={16} /><span>Claro</span></button>
              <button className={theme === 'dark' ? 'theme-choice-active' : ''} type="button" aria-pressed={theme === 'dark'} onClick={() => onThemeChange('dark')}><Moon size={16} /><span>Oscuro</span></button>
            </div>
          </section>
        </section>

        <section className="panel templates-panel">
          <div className="settings-templates-heading">
            <div className="settings-section-heading">
              <span className="settings-section-icon settings-message-icon"><MessageSquareText size={18} /></span>
              <div><div className="section-kicker">MENSAJES</div><h2>Plantillas de ofertas</h2></div>
            </div>
            <button className="text-button" type="button" onClick={() => setTemplateDraft({ nombreOferta: '', cuerpoMensaje: '', numeroAviso: 1, activa: true })}><Plus size={16} /><span>Nueva plantilla</span></button>
          </div>
          <div className="template-list">
            {templates.map((template) => (
              <article className="template-item" key={template.id}>
                <div className="template-item-heading">
                  <div><h3>{template.nombreOferta}</h3><span className="template-notice-number">Aviso {template.numeroAviso || 1}</span><span className={`template-state ${template.activa ? 'template-state-active' : ''}`}><span />{template.activa ? 'Activa' : 'Inactiva'}</span></div>
                  <div className="template-item-actions">
                    <button className="icon-button" type="button" title="Editar plantilla" aria-label={`Editar ${template.nombreOferta}`} onClick={() => setTemplateDraft({ ...template })}><Pencil size={15} /></button>
                    <button className="icon-button template-delete-button" type="button" title="Eliminar plantilla" aria-label={`Eliminar ${template.nombreOferta}`} onClick={() => setTemplateToDelete(template)}><Trash2 size={15} /></button>
                  </div>
                </div>
                <p className="template-message">{template.cuerpoMensaje}</p>
                <div className="template-item-footer"><span><ToggleLeft size={14} /> Disponible para avisos</span><button className="template-toggle" type="button" aria-pressed={template.activa} onClick={() => toggleTemplate(template)}>{template.activa ? 'Desactivar' : 'Activar'}</button></div>
              </article>
            ))}
            {templates.length === 0 && <div className="template-empty">Todavía no hay plantillas. Agrega una para preparar tus mensajes.</div>}
          </div>
        </section>
      </div>

      {templateDraft && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setTemplateDraft(null)}>
          <section className="client-modal template-modal" role="dialog" aria-modal="true" aria-labelledby="template-modal-title">
            <div className="modal-heading"><div><span className="modal-icon"><MessageSquareText size={19} /></span><div><div className="section-kicker">MENSAJES DE CLIENTES</div><h2 id="template-modal-title">{templateDraft.id ? 'Editar plantilla' : 'Nueva plantilla'}</h2></div></div><button className="icon-button" type="button" aria-label="Cerrar" onClick={() => setTemplateDraft(null)}><X size={19} /></button></div>
            <p className="modal-intro">Prepara el mensaje que recibirá cada familia.</p>
            <form onSubmit={saveTemplate}>
              <label className="form-field"><span>Nombre de la oferta</span><input autoFocus value={templateDraft.nombreOferta} onChange={(event) => setTemplateDraft((current) => ({ ...current, nombreOferta: event.target.value }))} placeholder="Ej. Celebración anticipada" required /></label>
              <label className="form-field"><span>Aviso asociado</span><select value={templateDraft.numeroAviso || 1} onChange={(event) => setTemplateDraft((current) => ({ ...current, numeroAviso: Number(event.target.value) }))}><option value="1">Aviso 1</option><option value="2">Aviso 2</option><option value="3">Aviso 3</option></select></label>
              <div className="form-field"><span>Mensaje</span><TemplateMessageEditor key={templateDraft.id ?? 'new'} value={templateDraft.cuerpoMensaje} onChange={(cuerpoMensaje) => setTemplateDraft((current) => ({ ...current, cuerpoMensaje }))} /></div>
              <label className="template-active-control"><input type="checkbox" checked={templateDraft.activa} onChange={(event) => setTemplateDraft((current) => ({ ...current, activa: event.target.checked }))} /><span>Plantilla activa</span></label>
              <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setTemplateDraft(null)}>Cancelar</button><button className="primary-button" type="submit" disabled={!templateDraft.cuerpoMensaje.trim()}><Check size={16} />Guardar plantilla</button></div>
            </form>
          </section>
        </div>
      )}
      {templateToDelete && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !deletionPending && setTemplateToDelete(null)}>
          <section className="client-modal deactivate-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-template-title" aria-describedby="delete-template-description">
            <div className="modal-heading">
              <div>
                <span className="modal-icon deactivate-modal-icon"><Trash2 size={19} /></span>
                <div><div className="section-kicker">PLANTILLAS DE OFERTAS</div><h2 id="delete-template-title">¿Eliminar "{templateToDelete.nombreOferta}"?</h2></div>
              </div>
              <button className="icon-button" type="button" aria-label="Cerrar" onClick={() => setTemplateToDelete(null)} disabled={deletionPending}><X size={19} /></button>
            </div>
            <p className="modal-intro" id="delete-template-description">La plantilla dejará de aparecer y no podrá volver a activarse.</p>
            <div className="deactivate-client-details"><strong>Aviso {templateToDelete.numeroAviso}</strong><span>{templateToDelete.activa ? 'Es la plantilla activa de este aviso.' : 'Actualmente está inactiva.'}</span></div>
            <p className="deactivate-preservation">El historial de notificaciones conservará sus mensajes. Si eliminas la activa, el aviso quedará sin plantilla hasta que actives otra.</p>
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setTemplateToDelete(null)} disabled={deletionPending} autoFocus>Cancelar</button>
              <button className="primary-button danger-button" type="button" onClick={deleteTemplate} disabled={deletionPending}><Trash2 size={16} />{deletionPending ? 'Eliminando…' : 'Eliminar plantilla'}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

export default SettingsPanel
