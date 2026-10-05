function formatDate(date) {
  return date.toISOString().slice(0, 10)
}

function parseDate(dateString) {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function birthdayInYear(birthDate, year) {
  const [, month, day] = birthDate.split('-').map(Number)
  const birthday = new Date(Date.UTC(year, month - 1, day))

  if (month === 2 && day === 29 && birthday.getUTCMonth() !== 1) {
    return new Date(Date.UTC(year, 1, 28))
  }
  return birthday
}

function shiftDate(date, days) {
  const shiftedDate = new Date(date)
  shiftedDate.setUTCDate(shiftedDate.getUTCDate() + days)
  return shiftedDate
}

export function getDueNotifications(client, settings, today) {
  const currentDate = parseDate(today)
  let birthday = birthdayInYear(client.fecha_nacimiento, currentDate.getUTCFullYear())

  if (birthday < currentDate) {
    birthday = birthdayInYear(client.fecha_nacimiento, currentDate.getUTCFullYear() + 1)
  }

  const anticipationDays = Number(settings.dias_anticipacion)
  const reminderCount = Number(settings.cantidad_notificaciones)
  const intervalDays = Number(settings.plazos_dias)
  if (
    !Number.isInteger(anticipationDays)
    || !Number.isInteger(reminderCount)
    || !Number.isInteger(intervalDays)
    || anticipationDays < 1
    || reminderCount < 1
    || intervalDays < 1
    || anticipationDays <= intervalDays * (reminderCount - 1)
  ) {
    throw new Error('La configuración no permite programar todos los avisos antes del cumpleaños.')
  }
  const birthdayYear = birthday.getUTCFullYear()

  return Array.from({ length: reminderCount }, (_, index) => {
    const daysBeforeBirthday = anticipationDays - index * intervalDays
    const scheduledDate = shiftDate(birthday, -daysBeforeBirthday)

    return {
      numeroNotificacion: index + 1,
      anioFestejo: birthdayYear,
      fechaProgramada: formatDate(scheduledDate),
    }
  }).filter((notification) => notification.fechaProgramada <= today)
}