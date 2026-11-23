import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import handler from '../api/index.js'

const app = express()
app.use(cors())
app.use('/api', (req, res) => handler(req, res))
app.listen(process.env.PORT || 8787, () => console.log(`PaperMind API listening on ${process.env.PORT || 8787}`))

