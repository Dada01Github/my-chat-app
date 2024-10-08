import React, { useState, useCallback, useRef, useEffect } from 'react';
import axios from 'axios';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import './index.css';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import imageCompression from 'browser-image-compression';

const getFormattedTime = () => {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const Chat = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [audioURL, setAudioURL] = useState('');
  const [audioDuration, setAudioDuration] = useState(0);
  const [copiedMessage, setCopiedMessage] = useState('');
  const { transcript, resetTranscript } = useSpeechRecognition();
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const messagesEndRef = useRef(null);
  const recordingStartTimeRef = useRef(null);
  const fileInputRef = useRef(null);

  const [showFileSelector, setShowFileSelector] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [selectedModel, setSelectedModel] = useState('claude-3.5-sonnet');

  const [useLocalApi, setUseLocalApi] = useState(import.meta.env.VITE_USE_LOCAL_API === 'true');

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
      console.log('useLocalApi:', useLocalApi);
      const apiUrl = useLocalApi ? 'http://localhost:3001/api/chat' : 'https://app.sea2rain.top/api/chat';

      console.log('正在发送请求到:', apiUrl);

      // 获取保存的图片分析结果
      const savedAnalyses = JSON.parse(localStorage.getItem('imageAnalyses') || '[]');
      const analysisContext = savedAnalyses.map(analysis => ({
        role: 'assistant',
        content: `图片分析结果 (${analysis.fileName}): ${analysis.result}`
      }));

      console.log('包含的图片分析上下文:', analysisContext);

      const response = await axios.post(apiUrl, {
        message: textToSend,
        conversationHistory: [
          ...analysisContext,
          ...messages.map(msg => ({
            role: msg.type === 'user' ? 'user' : 'assistant',
            content: msg.text
          }))
        ]
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
          const ttsApiUrl = useLocalApi ? 'http://localhost:3001/api/tts' : 'https://app.sea2rain.top/api/tts';
          const ttsResponse = await axios.post(ttsApiUrl, {
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
  }, [messages, useLocalApi]);

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
      setMessages(prevMessages => [...prevMessages, {
        text: '',
        type: 'user',
        time: timestamp,
        audio: audioURL,
        audioDuration: audioDuration
      }]);

      try {
        console.log('开始处理音频...');
        const audioBlob = await fetch(audioURL).then(r => r.blob());
        console.log('音频Blob已创建:', audioBlob.type, audioBlob.size, 'bytes');

        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.wav');
        console.log('FormData已创建，准备发送到服务器');

        console.log('发送STT请求到服务器...');
        const sttApiUrl = useLocalApi ? 'http://localhost:3001/api/stt' : 'https://app.sea2rain.top/api/stt';
        const response = await axios.post(sttApiUrl, formData, {
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
            text: '处理语音时出: ' + (error.response ? error.response.data.error : error.message)
          };
          return newMessages;
        });
      }

      setAudioURL('');
      setAudioDuration(0);
    }
  }, [audioURL, audioDuration, handleSendMessage, useLocalApi]);

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

        mediaRecorder.start();
        setIsRecording(true);
        recordingStartTimeRef.current = Date.now();
      })
      .catch(error => console.error('Error accessing microphone:', error));
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      const duration = (Date.now() - recordingStartTimeRef.current) / 1000;
      setAudioDuration(duration.toFixed(1));

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setAudioURL(audioUrl);
        console.log('录音已停止，时长:', duration.toFixed(1), '秒');
      };
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
    // 移除所有非字母字符
    const cleanText = text.replace(/[^a-zA-Z\s]/g, '');
    const words = cleanText.trim().split(/\s+/);
    
    if (words.length < 3) return false;
    
    const sampleSize = Math.min(3, words.length);
    const sampleWords = [];
    for (let i = 0; i < sampleSize; i++) {
      const randomIndex = Math.floor(Math.random() * words.length);
      sampleWords.push(words[randomIndex]);
    }
    
    return sampleWords.every(word => /^[A-Za-z]+$/.test(word));
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

  const deleteAudio = useCallback(() => {
    if (audioURL) {
      URL.revokeObjectURL(audioURL);
      setAudioURL('');
      console.log('录音已删除');
    }
  }, [audioURL]);

  useEffect(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setAudioURL(audioUrl);
        console.log('audioURL 已设置:', audioUrl);
      };
    }
  }, []);

  useEffect(() => {
    console.log('audioURL 更新:', audioURL);
  }, [audioURL]);

  const handleFileSelect = useCallback(() => {
    fileInputRef.current.click();
  }, []);

  const handleFileChange = useCallback(async (event) => {
    const file = event.target.files[0];
    if (file) {
      try {
        if (file.type.startsWith('image/')) {
          console.log('压缩前大小:', file.size / 1024 / 1024, 'MB');
          const compressedFile = await compressImage(file);
          console.log('压缩后大小:', compressedFile.size / 1024 / 1024, 'MB');

          const imageUrl = URL.createObjectURL(compressedFile);
          const newMessage = {
            text: `图片文件: ${file.name}`,
            type: 'user',
            time: getFormattedTime(),
            image: imageUrl
          };

          setMessages(prevMessages => [...prevMessages, newMessage]);

          // 图片分析逻辑
          const formData = new FormData();
          formData.append('image', compressedFile, file.name);

          console.log('FormData 内容:');
          for (let [key, value] of formData.entries()) {
            console.log(key, value);
          }

          const imageApiUrl = useLocalApi ? 'http://localhost:3001/api/analyze-image' : 'https://app.sea2rain.top/api/analyze-image';
          console.log('发送请求到:', imageApiUrl);
          const response = await axios.post(imageApiUrl, formData, {
            headers: {
              'Content-Type': 'multipart/form-data'
            }
          });

          console.log('服务器响应:', response.data);

          const analysisResult = response.data.result;

          setMessages(prevMessages => [
            ...prevMessages,
            {
              text: `图片分析结果 (${file.name})：\n${analysisResult}`,
              type: 'bot',
              time: getFormattedTime(),
              isImageAnalysis: true
            }
          ]);
        } else if (file.type.startsWith('audio/') || file.type.startsWith('video/')) {
          // 处理音频和视频文件
          const audioUrl = URL.createObjectURL(file);
          const newMessage = {
            text: `音频文件: ${file.name}`,
            type: 'user',
            time: getFormattedTime(),
            audio: audioUrl,
            audioFileName: file.name
          };

          // 处理音频文件的逻辑...
          const formData = new FormData();
          formData.append('file', file);

          const sttApiUrl = useLocalApi ? 'http://localhost:3001/api/stt' : 'https://app.sea2rain.top/api/stt';
          const response = await axios.post(sttApiUrl, formData, {
            headers: {
              'Content-Type': 'multipart/form-data'
            }
          });

          const transcription = response.data.text;
          const isEnglishTranscription = /^[A-Za-z\s.,!?]+$/.test(transcription.trim());

          const summaryResponse = await axios.post(useLocalApi ? 'http://localhost:3001/api/chat' : 'https://app.sea2rain.top/api/chat', {
            message: `请对以下文本进行简要概括:\n${transcription}`,
            conversationHistory: []
          });

          const summary = summaryResponse.data.message;

          const formattedMessage = isEnglishTranscription
            ? `1. summary:\n${summary}\n\n2. Original audio text:\n${transcription}`
            : `1. 概括：\n${summary}\n\n2. 音频原文：\n${transcription}`;

          setMessages(prevMessages => [
            ...prevMessages,
            newMessage,
            { 
              text: formattedMessage, 
              type: 'bot', 
              time: getFormattedTime() 
            }
          ]);
        } else {
          // 处理其他类型文件
          setMessages(prevMessages => [
            ...prevMessages,
            { 
              text: `文件已上传: ${file.name} (${file.type})`, 
              type: 'user', 
              time: getFormattedTime() 
            }
          ]);
        }
      } catch (error) {
        console.error('处理文件时出错:', error);
        let errorMessage = '处理文件时出错: ';
        if (error.response) {
          errorMessage += `服务器响应错误 (${error.response.status})`;
          console.error('错误响应数据:', error.response.data);
          console.error('错误响应头:', error.response.headers);
        } else if (error.request) {
          errorMessage += '未收到服务器响应';
          console.error('请求:', error.request);
        } else {
          errorMessage += error.message;
        }
        setMessages(prevMessages => [
          ...prevMessages,
          { 
            text: errorMessage, 
            type: 'bot', 
            time: getFormattedTime() 
          }
        ]);
      }

      // 清除文件输入，以便可以再次选择同一文件
      event.target.value = '';
    }
  }, [messages, useLocalApi]);

  // 格式化文件大小的辅助函数
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' bytes';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    else return (bytes / 1073741824).toFixed(1) + ' GB';
  };

  const handleModelSelect = useCallback(() => {
    setShowModelSelector(true);
  }, []);

  const handleFileUpload = useCallback((file) => {
    // 处理文件上传逻辑
    console.log('上传文件:', file.name);
    setShowFileSelector(false);
  }, []);

  const handleModelChange = useCallback((model) => {
    setSelectedModel(model);
    setShowModelSelector(false);
  }, []);

  const MicrophoneIcon = ({ isRecording }) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill={isRecording ? "red" : "currentColor"}>
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
    </svg>
  );

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.type}`}>
            <div className="message-text">{msg.text}</div>
            {msg.audio && (
              <div className="audio-message">
                <audio controls src={msg.audio}>
                  您的浏览器不支持音频元素。
                </audio>
                <span className="audio-filename">{msg.audioFileName}</span>
              </div>
            )}
            {msg.image && (
              <div className="image-message">
                <img src={msg.image} alt="上传的图片" style={{maxWidth: '100%', maxHeight: '300px'}} />
              </div>
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
      <div className="input-area">
        <div className="input-container">
          <button className="file-select-btn" onClick={handleFileSelect}>+</button>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="输入消息..."
          />
          <button className="send" onClick={handleSend}>发送</button>
          <button 
            className="record-btn" 
            onClick={isRecording ? stopRecording : startRecording}
            title={isRecording ? '停止录音' : '开始录音'}
          >
            <MicrophoneIcon isRecording={isRecording} />
          </button>
        </div>
        {audioURL && (
          <div className="audio-controls">
            <audio controls src={audioURL}>
              您的浏览器不支持音频元素。
            </audio>
            <button onClick={sendAudio}>发送录音</button>
            <button onClick={deleteAudio}>删除录音</button>
          </div>
        )}
        <div className="model-select-container">
          <button className="model-select-btn" onClick={handleModelSelect}>^</button>
        </div>
      </div>
      {showFileSelector && (
        <FileSelector onFileSelect={handleFileUpload} onClose={() => setShowFileSelector(false)} />
      )}
      {showModelSelector && (
        <ModelSelector 
          onModelSelect={handleModelChange} 
          onClose={() => setShowModelSelector(false)}
          currentModel={selectedModel}
        />
      )}
    </div>
  );
};

// 文件选择器组件
const FileSelector = ({ onFileSelect, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [files, setFiles] = useState([/* 模拟文件列表 */]);

  // 模拟文件搜索功能
  const filteredFiles = files.filter(file => 
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="file-selector">
      <input 
        type="text" 
        placeholder="搜索文件..." 
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
      <ul>
        {filteredFiles.map(file => (
          <li key={file.name} onClick={() => onFileSelect(file)}>{file.name}</li>
        ))}
      </ul>
      <button onClick={onClose}>关闭</button>
    </div>
  );
};

// 模型选择器组件
const ModelSelector = ({ onModelSelect, onClose, currentModel }) => {
  const models = ['claude-3.5-sonnet', 'gpt-4o', 'gpt-4o-mini','gemini-pro'];

  return (
    <div className="model-selector">
      {models.map(model => (
        <button 
          key={model} 
          onClick={() => onModelSelect(model)}
          className={currentModel === model ? 'selected' : ''}
        >
          {model}
        </button>
      ))}
      <button onClick={onClose}>关闭</button>
    </div>
  );
};

const compressImage = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const elem = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxSize = 1024;

        if (width > height && width > maxSize) {
          height *= maxSize / width;
          width = maxSize;
        } else if (height > maxSize) {
          width *= maxSize / height;
          height = maxSize;
        }

        elem.width = width;
        elem.height = height;
        const ctx = elem.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        ctx.canvas.toBlob(
          (blob) => {
            resolve(new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            }));
          },
          'image/jpeg',
          0.7
        );
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

export default Chat;