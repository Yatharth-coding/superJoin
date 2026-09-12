import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

async function test() {
  const key = process.env.GEMINI_API_KEY;
  const client = new GoogleGenerativeAI(key!);
  
  try {
    const model = client.getGenerativeModel({ model: 'gemini-3.5-flash' });
    const result = await model.generateContent('Return only a JSON array: [{"name":"test","value":42}]');
    console.log('Success:', result.response.text()?.slice(0, 200));
  } catch (err: any) {
    console.log('Failed:', err.message?.slice(0, 200));
  }
}

test();
