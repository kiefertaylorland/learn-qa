export const isDemoMode = false

export async function api(path, body) {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...(body !== undefined ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.')
  return data
}

export function subscribeToLeaderboard(onInvalidate) {
  const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/live`)
  socket.onmessage = () => onInvalidate()
  const poll = setInterval(onInvalidate, 30000)
  return () => {
    socket.close()
    clearInterval(poll)
  }
}
