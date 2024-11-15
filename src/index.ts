import express from 'express'
import { Markup, Telegraf } from 'telegraf'

const app = express()
app.get('/', async (req, res, next) => {
  const name = req.query['name']
  res.send(name ? `Hello Mr. ${name}` : 'Hello World!')
  next()
})
app.listen(8080, () => console.log('Server started'))

const token = process.env['TELEGRAM_BOT_TOKEN']
if (!token) throw new Error('TELEGRAM_BOT_TOKEN is undefined')
const bot = new Telegraf(token)
bot.command(
  'start',
  Telegraf.reply(
    'Привет! Добро пожаловать в наш сервис.',
    {
      reply_markup: {
        keyboard: [
          [Markup.button.callback('Оформить подписку', 'subscribe')],
        ],
        resize_keyboard: true
      }
    }
  )
)
bot.hears(
  'Оформить подписку',
  Telegraf.reply(
    'Отлично! Давайте оформим подписку. Какой период вас интересует?',
    {
      reply_markup: {
        inline_keyboard: [
          [Markup.button.callback('1 месяц - $2', 'subscribe-months-1')],
          [Markup.button.callback('3 месяц - $5', 'subscribe-months-3')],
          [Markup.button.callback('6 месяц - $10', 'subscribe-months-6')]
        ],
      }
    }
  )
)
const chain = <C,>(...fns: ((ctx: C) => void)[]) => (ctx: C) => { fns.forEach(x => x(ctx)) }
bot.action(
  'subscribe-months-1',
  chain(
    ctx => ctx.deleteMessage(),
    ctx => ctx.reply(
      `Вы выбрали подписку на 1 месяц.
Стоимость: $2

Пожалуйста, вышлите мне чек оплаты в виде файла.
Реквизиты для оплаты: <реквизиты>`
    ),
    ctx => { requests[ctx.chat?.id || -1] = 2 },
  )
)
bot.action(
  'subscribe-months-3',
  chain(
    ctx => ctx.deleteMessage(),
    ctx => ctx.reply(
      `Вы выбрали подписку на 3 месяца.
Стоимость: $5

Пожалуйста, вышлите мне чек оплаты в виде файла.
Реквизиты для оплаты: <реквизиты>`
    ),
    ctx => { requests[ctx.chat?.id || -1] = 5 },
  )
)
bot.action(
  'subscribe-months-6',
  chain(
    ctx => ctx.deleteMessage(),
    ctx => ctx.reply(
      `Вы выбрали подписку на 6 месяцев.
Стоимость: $10

Пожалуйста, вышлите мне чек оплаты в виде файла.
Реквизиты для оплаты: <реквизиты>`
    ),
    ctx => { requests[ctx.chat?.id || -1] = 10 },
  )
)

type UserId = number
type MessageId = number
const payments: Record<UserId, MessageId> = {}

const adminsInEnv = process.env['ADMINS']
if (!adminsInEnv) throw new Error('ADMINS is undefined or empty')
const admins: UserId[] = adminsInEnv.split(',').map(Number)
const anyAdmin = () => {
  for (const admin of admins) {
    if (admin in approoveRequests) continue
    return admin
  }
  return undefined
}

type Price = number
type Payment = {
  user: UserId,
  receipt: MessageId,
  price: Price
}
const requests: Record<UserId, Price> = {}
const approoveRequests: Record<UserId, Payment> = {}

bot.on('document', async ctx => {
  const price = requests[ctx.message.from.id]
  if (!price) return
  delete requests[ctx.message.from.id]
  payments[ctx.message.from.id] = ctx.message.message_id
  const admin = anyAdmin()
  if (!admin) {
    await ctx.reply('К сожалению сейчас нету доступных администраторов для проверки вашего чека. Попробуйте позже.')
    return
  }
  approoveRequests[admin] = {
    user: ctx.message.from.id,
    receipt: ctx.message.message_id,
    price: price
  }
  await ctx.forwardMessage(admin)
  await ctx.telegram.sendMessage(
    admin,
    `Пользователь ${ctx.message.from.username || ctx.message.from.id} отправил чек оплаты на сумму $${price}`,
    Markup.inlineKeyboard([
      [Markup.button.callback('Принять', 'approove'), Markup.button.callback('Отклонить', 'reject')]
    ])
  )
  await ctx.reply('Спасибо! Ваш чек отправлен на проверку администратору. Ожидайте подтверждения.')
})

bot.action('approove', chain(
  async ctx => {
    const payment = approoveRequests[ctx.from.id]
    if (!payment) return
    delete approoveRequests[ctx.from.id]
    await ctx.telegram.sendMessage(payment.user, `Оплата подтверждена! Ваша подписка активирована.
Ваш аккаунт:
Логин: user123@example.com
Пароль: zjasd@&e72q878RHIS`)
  },
  ctx => ctx.editMessageReplyMarkup({ inline_keyboard: [] }),
))

bot.action('reject', chain(
  async ctx => {
    const payment = approoveRequests[ctx.from.id]
    if (!payment) return
    delete approoveRequests[ctx.from.id]
    await ctx.telegram.sendMessage(payment.user, `К сожалению ваш платеж был отклонен. Свяжитесь с администрацией.`)
  },
  ctx => ctx.editMessageReplyMarkup({ inline_keyboard: [] }),
))

bot.launch(() => console.log('Bot started'))
