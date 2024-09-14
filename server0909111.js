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
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();// 创建 Express 应用
app.use(cors());// 允许跨域
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));

const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 500 * 1024 * 1024 } // 增加到 500MB
});

const OPENAI_API_KEY = process.env.VITE_OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
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

app.use((req, res, next) => {
  console.log('收到请求:', req.method, req.url);
  console.log('请求头:', req.headers);
  next();
});

// 语音/视频转文字路由
app.post('/api/stt', (req, res, next) => {
  console.log('开始处理 /api/stt 请求');
  next();
}, upload.single('file'), (req, res) => {
  console.log('收到 /api/stt 请求');
  
  if (!req.file) {
    console.log('没有接收到文件');
    return res.status(400).json({ error: '没有上传文件。' });
  }

  console.log('接收到文件:', req.file.originalname, req.file.mimetype, req.file.size, 'bytes');
  console.log('文件保存路径:', req.file.path);
  
  // 这里应该添加实际的音频/视频处理逻辑
  // 暂时返回一个模拟的转录结果
  const transcription = `这是 ${req.file.originalname} 的模拟转录结果。文件大小：${req.file.size} 字节。`;
  
  res.json({
    message: '文件上传成功',
    filename: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    transcription: transcription
  });
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
      model: 'gpt-4o-mini',//'gpt-3.5-turbo',
      messages: [...conversationHistory, { role: 'user', content: message }],
      temperature: 0.7, // 添加温度参数，控制回复的创造性
      max_tokens: 500, // 限制回复的最大长度
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

// 新增的图片分析路由
app.post('/api/analyze-image', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '没有上传文件。' });
  }

  console.log('接收到图片:', req.file.originalname, req.file.mimetype, req.file.size, 'bytes');

  try {
    const base64Image = req.file.buffer.toString('base64');

    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "you are a helpful assistant, Help me Analyzing the image,What's the image meaning?pls make a general overview or summary of the output." },
            {
              type: "image_url",
              image_url: {
                url: `data:${req.file.mimetype};base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 3000
    }, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const analysisResult = response.data.choices[0].message.content;
    console.log('图片分析结果:', analysisResult);

    res.json({ result: analysisResult });
  } catch (error) {
    console.error('调用 OpenAI API 时出错:', error);
    res.status(500).json({ error: '处理图片时发生错误。', details: error.message });
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

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({ error: '服务器内部错误', details: err.message });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`服务器运行在端口 ${PORT}`));