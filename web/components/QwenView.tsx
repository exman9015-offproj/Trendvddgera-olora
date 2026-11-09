'use client';

import React, { useState } from 'react';
import { Upload, Zap, Image as ImageIcon, ArrowRight } from 'lucide-react';
import {
  QWEN_IMAGE_SIZES,
  QWEN_LORA_OPTIONS,
  QWEN_STEP_RANGE,
  type QwenLoraId,
} from '../config/qwen-api-config';

type QwenMode = 'generate' | 'edit';

interface QwenViewProps {
  onClose?: () => void;
}

export default function QwenView({ onClose }: QwenViewProps) {
  const [mode, setMode] = useState<QwenMode>('generate');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate mode state
  const [prompt, setPrompt] = useState('');
  const [selectedSize, setSelectedSize] = useState('512x512');
  const [steps, setSteps] = useState<number>(QWEN_STEP_RANGE.default);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);

  // Edit mode state
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [editInstruction, setEditInstruction] = useState('');
  const [preserveIdentity, setPreserveIdentity] = useState(true);
  const [editedImage, setEditedImage] = useState<string | null>(null);

  const [executionTime, setExecutionTime] = useState<number | null>(null);

  // Shared by both modes
  const [lora, setLora] = useState<QwenLoraId>('none');

  const loraSelector = (
    <div>
      <label
        htmlFor={`qwen-lora-${mode}`}
        className="block text-sm font-semibold text-gray-700 mb-2"
      >
        LoRA
      </label>
      <select
        id={`qwen-lora-${mode}`}
        value={lora}
        onChange={(e) => setLora(e.target.value as QwenLoraId)}
        className="w-full p-3 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00A86B]"
        disabled={loading}
      >
        {QWEN_LORA_OPTIONS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      {lora !== 'none' && (
        <p className="text-xs text-gray-500 mt-1">
          A primeira requisição com esta LoRA baixa o arquivo e pode demorar mais.
        </p>
      )}
    </div>
  );

  // Generate image
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Por favor, descreva a imagem que deseja gerar');
      return;
    }

    setLoading(true);
    setError(null);
    setGeneratedImage(null);

    try {
      const response = await fetch('/api/generate-image-qwen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'generate',
          prompt,
          size: selectedSize,
          steps,
          lora,
        }),
      });

      const data = await response.json();

      if (!data.success || !response.ok) {
        setError(data.error || 'Falha ao gerar imagem');
        return;
      }

      setGeneratedImage(data.image);
      setExecutionTime(data.execution_time);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  // Edit image
  const handleEdit = async () => {
    if (!uploadedImage) {
      setError('Por favor, envie uma foto');
      return;
    }

    if (!editInstruction.trim()) {
      setError('Por favor, descreva a edição desejada');
      return;
    }

    setLoading(true);
    setError(null);
    setEditedImage(null);

    try {
      const response = await fetch('/api/generate-image-qwen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'edit',
          image: uploadedImage,
          instruction: editInstruction,
          steps,
          preserve_identity: preserveIdentity,
          lora,
        }),
      });

      const data = await response.json();

      if (!data.success || !response.ok) {
        setError(data.error || 'Falha ao editar imagem');
        return;
      }

      setEditedImage(data.image);
      setExecutionTime(data.execution_time);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  // Handle image upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Por favor, envie uma imagem válida');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setUploadedImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const downloadImage = (image: string, name: string) => {
    const link = document.createElement('a');
    link.href = image;
    link.download = `${name}-${Date.now()}.png`;
    link.click();
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4 pb-20">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Qwen Image 2.1</h1>
        <p className="text-gray-600">Gere ou edite imagens com IA</p>
      </div>

      {/* Mode Selector */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setMode('generate')}
          className={`flex-1 py-3 px-4 rounded-lg font-semibold transition ${
            mode === 'generate'
              ? 'bg-[#00A86B] text-white shadow-lg'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <Zap className="w-4 h-4 inline mr-2" />
          Gerar
        </button>
        <button
          onClick={() => setMode('edit')}
          className={`flex-1 py-3 px-4 rounded-lg font-semibold transition ${
            mode === 'edit'
              ? 'bg-[#00A86B] text-white shadow-lg'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <ImageIcon className="w-4 h-4 inline mr-2" />
          Editar
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-300 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Generate Mode */}
      {mode === 'generate' && (
        <div className="space-y-4">
          {/* Prompt Input */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Descrição da imagem
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ex: Uma paisagem montanhosa ao pôr do sol, estilos cinematográficos..."
              className="w-full h-24 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00A86B] resize-none"
              disabled={loading}
            />
          </div>

          {/* Size Selector */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Tamanho
            </label>
            <div className="grid grid-cols-2 gap-2">
              {QWEN_IMAGE_SIZES.map((size) => (
                <button
                  key={`${size.width}x${size.height}`}
                  onClick={() => setSelectedSize(`${size.width}x${size.height}`)}
                  className={`p-3 rounded-lg font-semibold transition ${
                    selectedSize === `${size.width}x${size.height}`
                      ? 'bg-[#00A86B] text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  disabled={loading}
                >
                  {size.label}
                </button>
              ))}
            </div>
          </div>

          {loraSelector}

          {/* Steps Slider */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Passos de inferência: {steps}
            </label>
            <input
              type="range"
              min={QWEN_STEP_RANGE.min}
              max={QWEN_STEP_RANGE.max}
              value={steps}
              onChange={(e) => setSteps(Number(e.target.value))}
              className="w-full"
              disabled={loading}
            />
            <p className="text-xs text-gray-500 mt-1">
              Mais passos = mais qualidade, mais lento
            </p>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            className="w-full py-3 bg-[#00A86B] text-white font-bold rounded-lg hover:bg-[#046A4E] disabled:bg-gray-300 transition flex items-center justify-center gap-2"
          >
            {loading ? '⏳ Gerando...' : '🎨 Gerar Imagem'}
          </button>

          {/* Generated Image */}
          {generatedImage && (
            <div className="mt-6">
              <img
                src={generatedImage}
                alt="Imagem gerada"
                className="w-full rounded-lg shadow-lg"
              />
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() =>
                    downloadImage(generatedImage, 'qwen-generated')
                  }
                  className="flex-1 py-2 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600"
                >
                  ⬇️ Baixar
                </button>
                <button
                  onClick={() => setGeneratedImage(null)}
                  className="flex-1 py-2 bg-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-400"
                >
                  Limpar
                </button>
              </div>
              {executionTime && (
                <p className="text-xs text-gray-500 mt-2">
                  Tempo: {(executionTime / 1000).toFixed(1)}s
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Edit Mode */}
      {mode === 'edit' && (
        <div className="space-y-4">
          {/* Image Upload */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Foto para editar
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-[#00A86B] transition">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                id="image-upload"
                disabled={loading}
              />
              <label htmlFor="image-upload" className="cursor-pointer">
                <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm text-gray-600">
                  Clique ou arraste uma imagem
                </p>
              </label>
            </div>

            {uploadedImage && (
              <div className="mt-3">
                <img
                  src={uploadedImage}
                  alt="Upload preview"
                  className="w-full rounded-lg shadow-lg max-h-64 object-cover"
                />
              </div>
            )}
          </div>

          {/* Edit Instruction */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Instrução de edição
            </label>
            <textarea
              value={editInstruction}
              onChange={(e) => setEditInstruction(e.target.value)}
              placeholder="Ex: Mude a cor do cabelo para azul, adicione um sorriso..."
              className="w-full h-24 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00A86B] resize-none"
              disabled={loading}
            />
          </div>

          {/* Preserve Identity Checkbox */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="preserve-identity"
              checked={preserveIdentity}
              onChange={(e) => setPreserveIdentity(e.target.checked)}
              className="w-4 h-4 text-[#00A86B] rounded"
              disabled={loading}
            />
            <label htmlFor="preserve-identity" className="text-sm text-gray-700">
              Preservar identidade da pessoa
            </label>
          </div>

          {loraSelector}

          {/* Steps Slider */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Força de transformação: {steps}
            </label>
            <input
              type="range"
              min={QWEN_STEP_RANGE.min}
              max={QWEN_STEP_RANGE.max}
              value={steps}
              onChange={(e) => setSteps(Number(e.target.value))}
              className="w-full"
              disabled={loading}
            />
            <p className="text-xs text-gray-500 mt-1">
              Valores menores = preserva mais a foto original
            </p>
          </div>

          {/* Edit Button */}
          <button
            onClick={handleEdit}
            disabled={loading || !uploadedImage || !editInstruction.trim()}
            className="w-full py-3 bg-[#00A86B] text-white font-bold rounded-lg hover:bg-[#046A4E] disabled:bg-gray-300 transition flex items-center justify-center gap-2"
          >
            {loading ? (
              '⏳ Editando...'
            ) : (
              <>
                ✨ Editar Imagem <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* Edited Image */}
          {editedImage && (
            <div className="mt-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">
                    Original
                  </p>
                  <img
                    src={uploadedImage!}
                    alt="Original"
                    className="w-full rounded-lg shadow"
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">
                    Editada
                  </p>
                  <img
                    src={editedImage}
                    alt="Editada"
                    className="w-full rounded-lg shadow"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => downloadImage(editedImage, 'qwen-edited')}
                  className="flex-1 py-2 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600"
                >
                  ⬇️ Baixar Editada
                </button>
                <button
                  onClick={() => setEditedImage(null)}
                  className="flex-1 py-2 bg-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-400"
                >
                  Limpar
                </button>
              </div>
              {executionTime && (
                <p className="text-xs text-gray-500 mt-2">
                  Tempo: {(executionTime / 1000).toFixed(1)}s
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Info Box */}
      <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-gray-700">
        <p className="font-semibold mb-1">💡 Dica:</p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>Descrições detalhadas geram melhores resultados</li>
          <li>Edições preservam mais da foto original em passos menores</li>
          <li>Modelo Qwen Image 2.1 é otimizado para qualidade e velocidade</li>
        </ul>
      </div>
    </div>
  );
}
