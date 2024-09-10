import * as dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import multer from 'multer';
import cors from 'cors';
import axios from 'axios';
import FormData from 'form-data';
import { Readable } from 'stream';
import http from 'http';
import https from 'https';
import axiosRetry from 'axios-retry';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json()); // 添加这行来解析 JSON 请求体

const upload = multer({ storage: multer.memoryStorage() });

const OPENAI_API_KEY = process.env.VITE_OPENAI_API_KEY;
console.log(OPENAI_API_KEY);
if (!OPENAI_API_KEY) {
  console.error('错误: OPENAI_API_KEY 未设置');
  process.exit(1);
}
console.log('OPENAI_API_KEY 已设置');

axiosRetry(axios, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    return axiosRetry.isNetworkOrIdempotentRequestError(error) || error.code === 'ECONNABORTED';
  }
});

app.post('/api/stt', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('没有上传文件。');
  }

  console.log('接收到文件:', req.file.originalname, req.file.mimetype, req.file.size, 'bytes');

  // 保存文件到本地
  const uploadDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
  }
  const filePath = path.join(uploadDir, `received_${Date.now()}_${req.file.originalname}`);
  fs.writeFileSync(filePath, req.file.buffer);
  console.log('文件已保存到:', filePath);

  try {
    const formData = new FormData();
    const bufferStream = new Readable();
    bufferStream.push(req.file.buffer);
    bufferStream.push(null);

    formData.append('file', bufferStream, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
      knownLength: req.file.size
    });
    formData.append('model', 'whisper-1');

    console.log('准备发送请求到 OpenAI STT API');
    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Connection': 'keep-alive'
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 300000, // 5 分钟
      httpAgent: new http.Agent({ keepAlive: true }),
      httpsAgent: new https.Agent({ keepAlive: true })
    });

    console.log('OpenAI STT API 响应:', response.data);
    res.json({ text: response.data.text });
  } catch (error) {
    console.error('调用 OpenAI STT API 时出错:', error);
    if (error.response) {
      console.error('错误响应数据:', error.response.data);
      console.error('错误响应状态:', error.response.status);
    } else if (error.request) {
      console.error('请求错误:', error.request);
    } else {
      console.error('错误:', error.message);
    }
    res.status(500).json({ error: '处理语音转文字请求时发生错误。', details: error.message });
  }
});

app.post('/api/chat', async (req, res) => {
  console.log('收到 /api/chat 请求');
  console.log('请求体:', req.body); // 添加这行来记录请求体

  try {
    const { message, conversationHistory } = req.body;
    
    // 验证输入
    if (!message || !Array.isArray(conversationHistory)) {
      return res.status(400).json({ error: '无效的请求数据' });
    }

    console.log('收到的消息:', message);
    console.log('对话历史:', JSON.stringify(conversationHistory, null, 2));

    console.log('准备发送请求到 OpenAI API');
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-3.5-turbo',
      messages: [...conversationHistory, { role: 'user', content: message }],
      temperature: 0.7, // 添加温度参数，控制回复的创造性
      max_tokens: 150, // 限制回复的最大长度
    }, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000, // 60秒超时
    });

    console.log('收到 OpenAI API 响应');
    console.log('API 响应数据:', JSON.stringify(response.data, null, 2));

    const aiMessage = response.data.choices[0].message.content;
    console.log('AI 回复:', aiMessage);

    // 返回更多有用的信息
    res.json({
      message: aiMessage,
      usage: response.data.usage,
      model: response.data.model,
    });

  } catch (error) {
    console.error('调用 OpenAI API 时出错:', error);
    let errorMessage = '处理请求时发生错误。';
    let statusCode = 500;

    if (error.response) {
      console.error('错误响应数据:', error.response.data);
      console.error('错误响应状态:', error.response.status);
      errorMessage = error.response.data.error.message || errorMessage;
      statusCode = error.response.status;
    } else if (error.request) {
      console.error('请求错误:', error.request);
      errorMessage = '无法连接到 OpenAI API。';
    } else {
      console.error('错误:', error.message);
      errorMessage = error.message;
    }

    res.status(statusCode).json({ error: errorMessage });
  }
});

app.get('/api/test', (req, res) => {
  console.log('收到 /api/test 请求');
  res.json({ message: '这是一条测试消息' });
});

app.post('/api/tts', async (req, res) => {
  console.log('收到 /api/tts 请求');
  console.log('请求体:', req.body);

  try {
    const { text, voice = 'alloy' } = req.body;

    if (!text) {
      return res.status(400).json({ error: '无效的请求数据，缺少文本内容' });
    }

    console.log('准备发送请求到 OpenAI TTS API');
    const response = await axios.post('https://api.openai.com/v1/audio/speech', 
      {
        model: 'tts-1',
        input: text,
        voice: voice,
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
      }
    );

    console.log('OpenAI TTS API 响应成功');

    // 直接将音频数据发送回客户端
    res.set('Content-Type', 'audio/mpeg');
    res.send(response.data);

  } catch (error) {
    console.error('调用 OpenAI TTS API 时出错:', error);
    let errorMessage = '处理文本转语音请求时发生错误。';
    let statusCode = 500;

    if (error.response) {
      console.error('错误响应数据:', error.response.data);
      console.error('错误响应状态:', error.response.status);
      errorMessage = error.response.data.error?.message || errorMessage;
      statusCode = error.response.status;
    } else if (error.request) {
      console.error('请求错误:', error.request);
      errorMessage = '无法连接到 OpenAI API。';
    } else {
      console.error('错误:', error.message);
      errorMessage = error.message;
    }

    res.status(statusCode).json({ error: errorMessage });
  }
});

async function testOpenAIConnection() {
  try {
    const response = await axios.get('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      timeout: 10000,
    });
    console.log('成功连接到 OpenAI API');
  } catch (error) {
    console.error('连接 OpenAI API 失败:', error.message);
  }
}

testOpenAIConnection();

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`服务器运行在端口 ${PORT}`));