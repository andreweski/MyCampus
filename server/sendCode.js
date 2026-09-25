import nodemailer from 'nodemailer';

export async function sendConfirmCode({ to, code, env }) {
  const user = env.BREVO_SMTP_USER;
  const pass = env.BREVO_SMTP_KEY;
  const from = env.BREVO_FROM;
  if (!user || !pass || !from) throw new Error('Brevo mail is not configured.');
  const transport = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: { user, pass },
  });
  await transport.sendMail({
    from: `MyCampus <${from}>`,
    to,
    subject: 'Your MyCampus code',
    text: `Your MyCampus confirmation code is ${code}. It expires in 15 minutes.`,
  });
}
