import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import axios from 'axios';
import cors from 'cors';
import axiosRetry from 'axios-retry';

const app = express();
app.use(express.json());
// 启用 CORS
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = ['https://dada01github.github.io', 'http://localhost:5173'];
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('不允许的来源'));
    }
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

const OPENAI_API_KEY = process.env.VITE_OPENAI_API_KEY;
//console.log(OPENAI_API_KEY);
if (!OPENAI_API_KEY) {
  console.error('错误: OPENAI_API_KEY 未设置');
  process.exit(1);
}
console.log('OPENAI_API_KEY 已设置');

// 配置 axios 重试
axiosRetry(axios, { retries: 3, retryDelay: axiosRetry.exponentialDelay });

app.post('/api/chat', async (req, res) => {
  console.log('收到 /api/chat 请求');
  try {
    const { message, conversationHistory } = req.body;
    console.log('收到的消息:', message);
    console.log('对话历史:', JSON.stringify(conversationHistory, null, 2));

    console.log('准备发送请求到 OpenAI API');
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-3.5-turbo',
      messages: [...conversationHistory, { role: 'user', content: message }],
    }, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    });

    console.log('收到 OpenAI API 响应');
    console.log('API 响应数据:', JSON.stringify(response.data, null, 2));

    const aiMessage = response.data.choices[0].message.content;
    console.log('准备发送 AI 回复:', aiMessage);

    res.json({ message: aiMessage });
    //console.log('发送 AI 回复:', res.json);
  } catch (error) {
    console.error('调用 OpenAI API 时出错:', error);
    if (error.response) {
      console.error('错误响应数据:', error.response.data);
      console.error('错误响应状态:', error.response.status);
    } else if (error.request) {
      console.error('请求错误:', error.request);
    } else {
      console.error('错误:', error.message);
    }
    res.status(500).json({ error: '处理请求时发生错误。' });
  }
});

app.get('/api/test', (req, res) => {
  console.log('收到 /api/test 请求');
  res.json({ message: '这是一条测试消息' });
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
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));