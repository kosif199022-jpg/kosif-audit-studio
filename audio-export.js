// KOSIF audio export helper
export async function downloadAudioBlob(blob, filename = 'kosif-response.webm') {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function createAudioRecorder(stream) {
  const chunks = [];
  const recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
  return {
    start: () => recorder.start(),
    stop: () => new Promise((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
      recorder.stop();
    })
  };
}
