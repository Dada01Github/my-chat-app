import React, { useState, useCallback, useRef } from 'react';
import axios from 'axios';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import './index.css'; // 确保导入 CSS 文件

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

  const handleSendMessage = useCallback(async (textToSend) => {
    if (!textToSend) return;

    const timestamp = getFormattedTime();
    setMessages(prevMessages => [...prevMessages, { text: textToSend, type: 'user', time: timestamp }]);

    try {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: textToSend }],
      }, {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      const botMessage = response.data.choices[0].message.content;
      const botTimestamp = getFormattedTime();
      setMessages(prevMessages => [...prevMessages, { text: botMessage, type: 'bot', time: botTimestamp }]);
    } catch (error) {
      console.error('调用 OpenAI API 时出错:', error);
      const errorTimestamp = getFormattedTime();
      setMessages(prevMessages => [...prevMessages, { text: '抱歉，发生了错误。请稍后再试。', type: 'bot', time: errorTimestamp }]);
    }
  }, []);

  const handleSend = useCallback(() => {
    const textToSend = input.trim() || transcript.trim();
    handleSendMessage(textToSend);
    setInput('');
    resetTranscript();
  }, [input, transcript, resetTranscript, handleSendMessage]);

  const sendAudio = useCallback(async () => {
    if (audioURL) {
      const timestamp = getFormattedTime();
      setMessages(prevMessages => [...prevMessages, { text: '发送了一段语音', type: 'user', time: timestamp, audio: audioURL }]);

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

        setMessages(prevMessages => {
          const newMessages = [...prevMessages];
          newMessages[newMessages.length - 1] = {
            ...newMessages[newMessages.length - 1],
            text: `发送了一段语音：${transcription}`
          };
          return newMessages;
        });

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

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.type}`}>
            <div className="message-text">{msg.text}</div>
            {msg.audio && (
              <audio controls src={msg.audio}>
                Your browser does not support the audio element.
              </audio>
            )}
            <div className="timestamp">{msg.time}</div>
          </div>
        ))}
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
              Your browser does not support the audio element.
            </audio>
            <button onClick={sendAudio}>发送录音</button>
          </>
        )}
      </div>
    </div>
  );
};

export default Chat;