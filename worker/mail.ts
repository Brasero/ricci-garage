import nodemailer from 'nodemailer'

export interface MailEnv {
  SMTP_USER: string
  SMTP_PASSWORD: string
  /** Facultatifs : par défaut Gmail (smtp.gmail.com:465, TLS). Surchargés en test local. */
  SMTP_HOST?: string
  SMTP_PORT?: string
  SMTP_SECURE?: string
}

export interface OutgoingMail {
  fromName: string
  to: string
  replyTo?: string
  subject: string
  text: string
  html: string
}

/** Envoie un email via Nodemailer (SMTP). Lève une exception en cas d'échec. */
export async function sendMail(env: MailEnv, mail: OutgoingMail): Promise<void> {
  const port = Number(env.SMTP_PORT ?? 465)
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST ?? 'smtp.gmail.com',
    port,
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  })
  await transport.sendMail({
    from: { name: mail.fromName, address: env.SMTP_USER },
    to: mail.to,
    replyTo: mail.replyTo,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  })
}
