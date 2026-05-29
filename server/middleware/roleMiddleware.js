export function requireAdmin(req, res, next) {
  const user = req.user
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Ushbu operatsiyani bajarish uchun admin huquqi kerak.' })
  }
  next()
}
