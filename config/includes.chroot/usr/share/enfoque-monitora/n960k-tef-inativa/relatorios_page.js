(function () {
  const statusEl = document.getElementById('captureStatus') || document.getElementById('status');
  const captureBtn = document.getElementById('captureNow') || document.getElementById('btnCaptureNow');

  function setStatus(message) {
    if (statusEl) statusEl.textContent = message;
  }

  async function captureNow() {
    setStatus('Capturando cookie/token do MeuSIGE...');
    try {
      const response = await chrome.runtime.sendMessage({ type: 'capture-now' });
      if (response && response.ok) {
        setStatus('Cookie/token enviados para a repo. Aguarde alguns segundos e valide no servidor.');
      } else {
        setStatus(`Falha ao capturar: ${response?.error || 'erro desconhecido'}`);
      }
    } catch (error) {
      setStatus(`Falha ao capturar: ${error?.message || error}`);
    }
  }

  if (captureBtn) captureBtn.addEventListener('click', captureNow);
  document.addEventListener('DOMContentLoaded', () => setStatus('Abra o MeuSIGE logado e clique em capturar, ou aguarde a captura automatica.'));
})();
