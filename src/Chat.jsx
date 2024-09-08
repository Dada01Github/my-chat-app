import React, { useState, useCallback, useRef, useEffect } from 'react';
import axios from 'axios';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import './index.css'; // 确保导入 CSS 文件
import { CopyToClipboard } from 'react-copy-to-clipboard';

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

// 添加一个获取格式化时间的函数
const getFormattedTime = () => {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};


const Chat = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const { transcript, resetTranscript } = useSpeechRecognition();
  const [isRecording, setIsRecording] = useState(false);
  const [audioURL, setAudioURL] = useState('');
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const messagesEndRef = useRef(null);
  const [copiedMessage, setCopiedMessage] = useState('');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = useCallback(async (textToSend) => {
    if (!textToSend) return;

    const timestamp = getFormattedTime();
    setMessages(prevMessages => [...prevMessages, { text: textToSend, type: 'user', time: timestamp }]);

    try {
      const response = await axios.post('https://app.sea2rain.top:3001/api/chat', {
      //const response = await axios.post('http://localhost:3001/api/chat', {
        message: textToSend,
        conversationHistory: messages.map(msg => ({
          role: msg.type === 'user' ? 'user' : 'assistant',
          content: msg.text
        }))
      }, {
        timeout: 10000 // 设置为 10 秒
      });
      console.log('收到 OpenAI API 响应',response);
      const botMessage = response.data.message;
      
      // 计数函数
      const getCount = (text) => {
        const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
        const englishWords = text.match(/[a-zA-Z]+/g) || [];
        
        return {
          chineseCount: chineseChars.length,
          englishCount: englishWords.length
        };
      };
      
      const { chineseCount, englishCount } = getCount(botMessage);
      let countInfo = '';
      if (chineseCount > 0 || englishCount > 0) {
        countInfo = `(`;
        if (chineseCount > 0) {
          countInfo += `CN: ${chineseCount}`;
        }
        if (chineseCount > 0 && englishCount > 0) {
          countInfo += `, `;
        }
        if (englishCount > 0) {
          countInfo += `EN: ${englishCount}`;
        }
        countInfo += `)`;
      }
      
      const botMessageWithCount = `${botMessage}\n${countInfo}`;
      console.log('机器人回复:', botMessageWithCount);
      const botTimestamp = getFormattedTime();

      let audioUrl = null;

      // 新的英文检测函数
      const isEnglish = (text) => {
        const words = text.trim().split(/\s+/);
        console.log('总词数:', words.length);
        
        if (words.length < 3) {
          console.log('词数少于3，返回false');
          return false;
        }
        
        const sampleSize = Math.min(3, words.length);
        const sampleWords = [];
        for (let i = 0; i < sampleSize; i++) {
          const randomIndex = Math.floor(Math.random() * words.length);
          sampleWords.push(words[randomIndex]);
        }
        
        console.log('抽样词语:', sampleWords);
        
        const result = sampleWords.every(word => /^[A-Za-z]+([-']?[A-Za-z]+)*('?s)?$/.test(word));
        console.log('判断结果:', result);
        
        return result;
      };

      // 使用新的检测函数
      if (isEnglish(botMessage)) {
        console.log('检测到英文回复，准备生成TTS');
        // 调用TTS API
        try {
          const ttsResponse = await axios.post('https://api.openai.com/v1/audio/speech', {
            model: 'tts-1',
            input: botMessage,
            voice: 'alloy',
          }, {
            headers: {
              'Authorization': `Bearer ${OPENAI_API_KEY}`,
              'Content-Type': 'application/json',
            },
            responseType: 'arraybuffer',
          });

          console.log('TTS API 调用成功，响应状态:', ttsResponse.status);

          // 创建音频URL
          const audioBlob = new Blob([ttsResponse.data], { type: 'audio/mpeg' });
          audioUrl = URL.createObjectURL(audioBlob);
          console.log('生成的音频 URL:', audioUrl);
        } catch (ttsError) {
          console.error('TTS API 调用失败:', ttsError);
        }
      } else {
        console.log('非英文回复或不满足条件，跳过TTS生成');
      }

      // 无论是否有音频，都同时发送文本和音频（如果有）
      setMessages(prevMessages => [...prevMessages, { 
        text: botMessageWithCount,
        type: 'bot', 
        time: botTimestamp,
        audio: audioUrl 
      }]);

    } catch (error) {
      console.error('调用 OpenAI API 时出错:', error);
      const errorTimestamp = getFormattedTime();
      setMessages(prevMessages => [...prevMessages, { text: '抱歉，发生了错误。请稍后再试。', type: 'bot', time: errorTimestamp }]);
    }
  }, [messages]);

  const handleSend = useCallback(() => {
    const textToSend = input.trim() || transcript.trim();
    if (textToSend) {
      handleSendMessage(textToSend);
      setInput('');
      resetTranscript();
    }
  }, [input, transcript, resetTranscript, handleSendMessage]);

  const sendAudio = useCallback(async () => {
    if (audioURL) {
      const timestamp = getFormattedTime();
      setMessages(prevMessages => [...prevMessages, {text: '',type: 'user', time: timestamp, audio: audioURL }]);

      try {
        const audioBlob = await fetch(audioURL).then(r => r.blob());
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.wav');
        formData.append('model', 'whisper-1');

        const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'multipart/form-data'
          }
        });

        const transcription = response.data.text;

        // 直接将转录文本发送给 OpenAI，而不更新消息
        handleSendMessage(transcription);

      } catch (error) {
        console.error('Error processing audio:', error);
        setMessages(prevMessages => {
          const newMessages = [...prevMessages];
          newMessages[newMessages.length - 1] = {
            ...newMessages[newMessages.length - 1],
            text: '处理语音时出错'
          };
          return newMessages;
        });
      }

      setAudioURL('');
    }
  }, [audioURL, handleSendMessage]);

  const handleCopy = useCallback((text) => {
    setCopiedMessage(text);
    setTimeout(() => setCopiedMessage(''), 2000); // 2秒后清除提示
  }, []);

  const startRecording = useCallback(() => {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          audioChunksRef.current.push(event.data);
        };

        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
          const audioUrl = URL.createObjectURL(audioBlob);
          setAudioURL(audioUrl);
        };

        mediaRecorder.start();
        setIsRecording(true);
      })
      .catch(error => console.error('Error accessing microphone:', error));
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  const handleFileInput = useCallback(async (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64String = e.target.result.split(',')[1]; // 获取 Base64 字符串
        // 调用 OpenAI API 处理图片或视频
        // ...
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleKeyPress = useCallback((e) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  }, [handleSend]);

  const handleVoiceInput = useCallback(() => {
    if (transcript) {
      handleSend();
    } else {
      SpeechRecognition.startListening();
    }
  }, [transcript, handleSend]);

  const handleForward = useCallback((messageToForward) => {
    handleSendMessage(messageToForward);
  }, [handleSendMessage]);

  const testBackendConnection = async () => {
    try {
      const response = await fetch('https//app.sea2rain.top:3001/api/test');
      //const response = await fetch('http://localhost:3001/api/test');
      if (!response.ok) {
        throw new Error('服务器响应错误');
      }
      const data = await response.json();
      console.log('从后端收到的测试消息:', data.message);
      // 可以在这里添加代码来在页面上显示测试消息
    } catch (error) {
      console.error('测试请求出错:', error);
      // 在这里处理错误，例如在页面上显示错误消息
    }
  };

  testBackendConnection();

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.type}`}>
            <div className="message-text">{msg.text}</div>
            {msg.audio && (
              <audio controls src={msg.audio}>
                您的浏览器不支持音频元素。
              </audio>
            )}
            <div className="timestamp">{msg.time}</div>
            <button onClick={() => handleForward(msg.text)}>转发</button>
            <CopyToClipboard text={msg.text} onCopy={() => handleCopy(msg.text)}>
              <button>复制</button>
            </CopyToClipboard>
            {copiedMessage === msg.text && <span className="copy-tooltip">已复制!</span>}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="input-container">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="输入消息..."
        />
        <button onClick={handleSend}>发送</button>
        <button onClick={isRecording ? stopRecording : startRecording}>
          {isRecording ? '停止录音' : '开始录音'}
        </button>
        {audioURL && (
          <>
            <audio controls src={audioURL}>
              您的浏览器不支持音频元素。
            </audio>
            <button onClick={sendAudio}>发送录音</button>
          </>
        )}
      </div>
    </div>
  );
};

export default Chat;