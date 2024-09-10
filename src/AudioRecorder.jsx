import React, { useState, useCallback } from 'react';

const AudioRecorder = ({ onRecordingComplete }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);

  const startRecording = useCallback(() => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error('getUserMedia 不被支持');
      alert('您的浏览器不支持录音功能。请尝试使用最新版本的 Chrome、Firefox 或 Safari。');
      return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        console.log('成功获取音频流');
        setIsRecording(true);

        const mediaRecorder = new MediaRecorder(stream);
        const audioChunks = [];

        mediaRecorder.addEventListener("dataavailable", event => {
          audioChunks.push(event.data);
        });

        mediaRecorder.addEventListener("stop", () => {
          const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
          setAudioBlob(audioBlob);
          onRecordingComplete(audioBlob);
        });

        mediaRecorder.start();

        // 5秒后停止录音（您可以根据需要调整这个时间）
        setTimeout(() => {
          mediaRecorder.stop();
          setIsRecording(false);
        }, 5000);
      })
      .catch(error => {
        console.error('获取麦克风访问权限失败:', error);
        alert('无法访问麦克风。请确保您已授予网站麦克风访问权限。');
      });
  }, [onRecordingComplete]);

  return (
    <div>
      <button onClick={startRecording} disabled={isRecording}>
        {isRecording ? '正在录音...' : '开始录音'}
      </button>
      {audioBlob && (
        <audio src={URL.createObjectURL(audioBlob)} controls />
      )}
    </div>
  );
};

export default AudioRecorder;
