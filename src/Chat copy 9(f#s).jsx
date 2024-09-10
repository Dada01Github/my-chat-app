import React, { useState, useCallback, useRef, useEffect } from 'react';
import axios from 'axios';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import './index.css';
import { CopyToClipboard } from 'react-copy-to-clipboard';

// ... (previous code remains unchanged)

const Chat = () => {
  // ... (previous state and functions remain unchanged)

  const sendAudio = useCallback(async () => {
    if (audioURL) {
      const timestamp = getFormattedTime();
      setMessages(prevMessages => [...prevMessages, {text: '正在处理音频...', type: 'user', time: timestamp, audio: audioURL }]);

      try {
        console.log('开始处理音频...');
        const audioBlob = await fetch(audioURL).then(r => r.blob());
        console.log('音频Blob已创建:', audioBlob.type, audioBlob.size, 'bytes');

        // 确保 audioBlob 是有效的 Blob 对象
        if (!(audioBlob instanceof Blob)) {
          throw new Error('无效的音频 Blob 对象');
        }

        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.wav');
        console.log('FormData已创建，准备发送到服务器');

        console.log('发送STT请求到服务器...');
        const response = await axios.post('http://localhost:3001/api/stt', formData, {
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
            text: '处理语音时出错: ' + (error.response ? JSON.stringify(error.response.data) : error.message)
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

  // Helper function to write strings to DataView
  function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  // ... (rest of the component code remains unchanged)

  return (
    // ... (JSX remains unchanged)
  );
};

export default Chat;