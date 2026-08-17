import { appendFile, mkdir } from "node:fs/promises";

import { resolve } from "node:path";



export type Mail = {

  to: string;

  subject: string;

  text: string;

  html?: string;

  replyTo?: string;

};



export async function sendMail(mail: Mail) {

  const htmlBlock = mail.html ? `\n[HTML]\n${mail.html}\n` : "";

  const line = `\n---\n${new Date().toISOString()}\nTo: ${mail.to}\nSubject: ${mail.subject}${mail.replyTo ? `\nReply-To: ${mail.replyTo}` : ""}\n\n${mail.text}${htmlBlock}\n`;

  console.log(`[mail] ${mail.subject} -> ${mail.to}`);

  const dir = resolve("data");

  await mkdir(dir, { recursive: true });

  await appendFile(resolve(dir, "mail.log"), line, "utf8");

}

