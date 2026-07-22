import { useRef, useState } from 'react'
import { api } from '../api.js'

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      const base64 = result.substring(result.indexOf(',') + 1)
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function PhotoCapture({ onCandidates, onError, analyzing, setAnalyzing }) {
  const inputRef = useRef(null)
  const [previewUrl, setPreviewUrl] = useState(null)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setPreviewUrl(URL.createObjectURL(file))
    setAnalyzing(true)
    onError(null)

    try {
      const imageBase64 = await fileToBase64(file)
      const mediaType = file.type || 'image/jpeg'
      const { items } = await api.analyzePhoto(imageBase64, mediaType)
      onCandidates(items)
    } catch (err) {
      onError(err.message || 'Falha ao analisar a foto')
    } finally {
      setAnalyzing(false)
      e.target.value = ''
    }
  }

  return (
    <div className="photo-capture">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        style={{ display: 'none' }}
      />
      <button className="btn btn-primary" onClick={() => inputRef.current?.click()} disabled={analyzing}>
        {analyzing ? 'Analisando...' : '📷 Tirar foto / enviar imagem'}
      </button>
      {previewUrl && !analyzing && (
        <img src={previewUrl} alt="preview" className="photo-preview" />
      )}
      {analyzing && <div className="analyzing-hint">Analisando a foto, aguarde...</div>}
    </div>
  )
}
