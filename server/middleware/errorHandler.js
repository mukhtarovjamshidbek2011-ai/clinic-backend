export function errorHandler(err, _req, res, _next) {
  const status = err.status || 500
  console.error('[server error]', err.message || err)
  res.status(status).json({
    error: err.message || 'Serverda xatolik yuz berdi.',
  })
}
