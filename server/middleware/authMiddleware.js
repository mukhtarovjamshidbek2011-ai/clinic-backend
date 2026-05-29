import jwt from 'jsonwebtoken'
import { JWT_SECRET } from '../config/appConfig.js'

export function verifyJwt(req, res, next) {
  const authHeader = req.headers.authorization || req.headers.Authorization
  if (!authHeader) {
    return res.status(401).json({ error: 'Token mavjud emas. Iltimos, avval tizimga kiring.' })
  }

  const [scheme, token] = authHeader.split(' ')
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Notogri avtorizatsiya sarlavhasi.' })
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.user = payload
    next()
  } catch (error) {
    return res.status(401).json({ error: "JWT token yaroqsiz yoki muddati o'tgan." })
  }
}
