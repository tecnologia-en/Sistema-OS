/* N960K v1.7.8.27: load the approved TEF background byte-for-byte.
 * USB discovery is optional. A detection error may NEVER disable the
 * existing TEF service worker or any financial command handler.
 */
importScripts('n960k-background.js');
try {
  importScripts('n960k-discovery.js');
} catch (error) {
  console.warn('[Enfoque N960K] Detector USB independente indisponivel; TEF preservado.', error);
}
try {
  importScripts('n960k-boot-ready.js');
} catch (error) {
  console.warn('[Enfoque N960K] Inicializacao passiva indisponivel; TEF preservado.', error);
}
