import React, { useState, useCallback, useRef, useEffect } from 'react';
import axios from 'axios';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import './index.css';
import { CopyToClipboard } from 'react-copy-to-clipboard';

const getFormattedTime = () => {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const Chat = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [audioURL, setAudioURL] = useState('');
  const [copiedMessage, setCopiedMessage] = useState('');
  const { transcript, resetTranscript } = useSpeechRecognition();
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const messagesEndRef = useRef(null);

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
      const useLocalApi = import.meta.env.VITE_USE_LOCAL_API === 'true';
      console.log('useLocalApi:', useLocalApi);
      const apiUrl = useLocalApi ? 'http://localhost:3001/api/chat' : 'https://app.sea2rain.top/api/chat';

      console.log('正在发送请求到:', apiUrl);

      const response = await axios.post(apiUrl, {
        message: textToSend,
        conversationHistory: messages.map(msg => ({
          role: msg.type === 'user' ? 'user' : 'assistant',
          content: msg.text
        }))
      }, {
        timeout: 10000
      });
      
      console.log('收到 API 响应', response);
      const botMessage = response.data.message;
      
      const { chineseCount, englishCount } = getCount(botMessage);
      let countInfo = '';
      if (chineseCount > 0 || englishCount > 0) {
        countInfo = `(CN: ${chineseCount}, EN: ${englishCount})`;
      }
      
      const botMessageWithCount = `${botMessage}\n${countInfo}`;
      console.log('机器人回复:', botMessageWithCount);
      const botTimestamp = getFormattedTime();

      let audioUrl = null;

      if (isEnglish(botMessage)) {
        console.log('检测到英文回复，准备生成TTS');
        try {
          const ttsResponse = await axios.post('https://app.sea2rain.top/api/tts', {
            text: botMessage
          }, {
            responseType: 'arraybuffer'
          });

          console.log('TTS API 调用成功，响应状态:', ttsResponse.status);

          // 将接收到的数据转换为 Blob
          const audioBlob = new Blob([ttsResponse.data], { type: 'audio/mpeg' });
          audioUrl = URL.createObjectURL(audioBlob);
          console.log('生成的音频 URL:', audioUrl);
        } catch (ttsError) {
          console.error('TTS API 调用失败:', ttsError);
        }
      } else {
        console.log('非英文回复或不满足条件，跳过TTS生成');
      }

      setMessages(prevMessages => [...prevMessages, { 
        text: botMessageWithCount,
        type: 'bot', 
        time: botTimestamp,
        audio: audioUrl 
      }]);

    } catch (error) {
      console.error('调用 API 时出错:', error);
      if (error.response) {
        console.error('错误响应状态:', error.response.status);
        console.error('错误响应数据:', error.response.data);
      } else if (error.request) {
        console.error('未收到响应:', error.request);
      } else {
        console.error('错误信息:', error.message);
      }
      const errorTimestamp = getFormattedTime();
      setMessages(prevMessages => [...prevMessages, { 
        text: `抱歉，发生了错误。请稍后再试。错误详情: ${error.message}`, 
        type: 'bot', 
        time: errorTimestamp 
      }]);
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
        console.log('开始处理音频...');
        const audioBlob = await fetch(audioURL).then(r => r.blob());
        console.log('音频Blob已创建:', audioBlob.type, audioBlob.size, 'bytes');

        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.wav');
        console.log('FormData已创建，准备发送到服务器');

        console.log('发送STT请求到服务器...');
        //const response = await axios.post('http://localhost:3001/api/stt', formData, {
        const response = await axios.post('https://app.sea2rain.top/api/stt', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });

        console.log('收到服务器STT响应:', response.data);
        const transcription = response.data.text;

        console.log('转录文本:', transcription);
        handleSendMessage(transcription);

      } catch (error) {
        console.error('处理音频时出错:', error);
        if (error.response) {
          console.error('错误响应数据:', error.response.data);
          console.error('错误响应状态:', error.response.status);
        } else if (error.request) {
          console.error('请求错误:', error.request);
        } else {
          console.error('错误:', error.message);
        }
        setMessages(prevMessages => {
          const newMessages = [...prevMessages];
          newMessages[newMessages.length - 1] = {
            ...newMessages[newMessages.length - 1],
            text: '处理语音时出错: ' + (error.response ? error.response.data.error : error.message)
          };
          return newMessages;
        });
      }

      setAudioURL('');
    }
  }, [audioURL, handleSendMessage]);

  const handleCopy = useCallback((text) => {
    setCopiedMessage(text);
    setTimeout(() => setCopiedMessage(''), 2000);
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

  const getCount = (text) => {
    const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
    const englishWords = text.match(/[a-zA-Z]+/g) || [];
    
    return {
      chineseCount: chineseChars.length,
      englishCount: englishWords.length
    };
  };

  const isEnglish = (text) => {
    const words = text.trim().split(/\s+/);
    if (words.length < 3) return false;
    
    const sampleSize = Math.min(3, words.length);
    const sampleWords = [];
    for (let i = 0; i < sampleSize; i++) {
      const randomIndex = Math.floor(Math.random() * words.length);
      sampleWords.push(words[randomIndex]);
    }
    
    return sampleWords.every(word => /^[A-Za-z]+([-']?[A-Za-z]+)*('?s)?$/.test(word));
  };

  useEffect(() => {
    return () => {
      messages.forEach(msg => {
        if (msg.audio) {
          URL.revokeObjectURL(msg.audio);
        }
      });
    };
  }, [messages]);

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