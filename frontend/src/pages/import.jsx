import { useState, useRef } from 'react';
import { Upload, Download, AlertCircle, CheckCircle2, FileSpreadsheet,
         X, Loader2, AlertTriangle } from 'lucide-react';
import { importAPI, downloadBlob } from '../utils/api';
import { useProjectStore } from '../hooks/useAuth';
import toast from 'react-hot-toast';

export default function ImportPage() {
  const { currentProject } = useProjectStore();
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const inputRef = useRef();

  const downloadTemplate = async () => {
    try {
      const res = await importAPI.downloadTemplate(currentProject.id);
      downloadBlob(res.data, 'plantilla_entregables.xlsx');
      toast.success('Plantilla descargada.');
    } catch {
      toast.error('Error al descargar la plantilla.');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  };

  const handleUpload = async () => {
    if (!file || !currentProject?.id) return;
    setLoading(true);
    setProgress(0);
    setResult(null);
    try {
      const { data } = await importAPI.upload(currentProject.id, file, setProgress);
      setResult(data);
      if (data.errors?.length === 0) {
        toast.success(`${data.inserted} entregables importados exitosamente.`);
      } else {
        toast(`${data.inserted} importados, ${data.errors.length} errores.`, { icon: '⚠️' });
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error en la importación.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="font-display font-bold text-2xl text-surface-900">Importación masiva</h1>
        <p className="text-sm text-surface-400 mt-0.5">
          Suba un archivo Excel para registrar múltiples entregables de una sola vez.
        </p>
      </div>

      {/* Step 1: Download template */}
      <div className="card p-5">
        <div className="flex items-start gap-4">
          <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center shrink-0">
            <span className="font-display font-bold text-brand-600 text-sm">1</span>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-surface-800 text-sm mb-1">Descargue la plantilla</h3>
            <p className="text-xs text-surface-500 mb-3">
              La plantilla se genera dinámicamente según los campos configurados para el proyecto actual.
              La primera fila contiene los encabezados, la segunda los valores permitidos.
            </p>
            <button className="btn-secondary text-xs" onClick={downloadTemplate}
              disabled={!currentProject}>
              <Download size={13} /> Descargar plantilla Excel
            </button>
          </div>
        </div>
      </div>

      {/* Step 2: Upload */}
      <div className="card p-5">
        <div className="flex items-start gap-4">
          <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center shrink-0">
            <span className="font-display font-bold text-brand-600 text-sm">2</span>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-surface-800 text-sm mb-3">Suba el archivo completo</h3>

            {/* Drop zone */}
            <div
              className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
                transition-all duration-150
                ${dragging ? 'border-brand-400 bg-brand-50' : 'border-surface-200 hover:border-brand-300 hover:bg-surface-50'}
                ${file ? 'border-emerald-300 bg-emerald-50' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={e => setFile(e.target.files[0])} />

              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <FileSpreadsheet size={28} className="text-emerald-500" />
                  <div className="text-left">
                    <p className="text-sm font-semibold text-emerald-700">{file.name}</p>
                    <p className="text-xs text-emerald-500">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button
                    className="ml-2 text-surface-400 hover:text-red-500"
                    onClick={e => { e.stopPropagation(); setFile(null); setResult(null); }}>
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <Upload size={28} className="text-surface-300 mx-auto mb-2" />
                  <p className="text-sm font-medium text-surface-600">
                    Arrastre el archivo aquí o haga clic para seleccionar
                  </p>
                  <p className="text-xs text-surface-400 mt-1">Formatos: .xlsx, .xls, .csv · Máximo 10MB</p>
                </>
              )}
            </div>

            {/* Upload progress */}
            {loading && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-surface-500 mb-1">
                  <span className="flex items-center gap-1.5">
                    <Loader2 size={12} className="animate-spin text-brand-500" />
                    Procesando...
                  </span>
                  <span>{progress}%</span>
                </div>
                <div className="progress-bar h-2">
                  <div className="progress-fill h-2 rounded-full"
                    style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}

            <button className="btn-primary mt-4 w-full justify-center"
              onClick={handleUpload}
              disabled={!file || loading || !currentProject}>
              {loading
                ? <><Loader2 size={14} className="animate-spin" /> Importando...</>
                : <><Upload size={14} /> Iniciar importación</>
              }
            </button>
          </div>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className="card p-5 animate-fadeIn">
          <h3 className="font-semibold text-surface-800 text-sm mb-4">Resultado de importación</h3>

          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="bg-surface-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-display font-bold text-surface-900">{result.total}</p>
              <p className="text-xs text-surface-400">Filas totales</p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-display font-bold text-emerald-700">{result.inserted}</p>
              <p className="text-xs text-emerald-600">Importados</p>
            </div>
            <div className={`rounded-lg p-3 text-center ${result.errors?.length > 0 ? 'bg-red-50' : 'bg-surface-50'}`}>
              <p className={`text-2xl font-display font-bold ${result.errors?.length > 0 ? 'text-red-700' : 'text-surface-400'}`}>
                {result.errors?.length || 0}
              </p>
              <p className={`text-xs ${result.errors?.length > 0 ? 'text-red-500' : 'text-surface-400'}`}>Errores</p>
            </div>
          </div>

          {/* Error detail */}
          {result.errors?.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide flex items-center gap-1">
                <AlertTriangle size={12} /> Filas con errores
              </p>
              <div className="max-h-64 overflow-y-auto space-y-2 scrollbar-thin">
                {result.errors.map((e, i) => (
                  <div key={i} className="bg-red-50 border border-red-100 rounded-lg p-3">
                    <p className="text-xs font-semibold text-red-700 mb-1">Fila {e.row}</p>
                    <ul className="space-y-0.5">
                      {e.errors.map((err, j) => (
                        <li key={j} className="text-xs text-red-600 flex items-start gap-1">
                          <AlertCircle size={10} className="shrink-0 mt-0.5" /> {err}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.errors?.length === 0 && (
            <div className="flex items-center gap-2 text-emerald-700 text-sm">
              <CheckCircle2 size={16} />
              Todos los entregables fueron importados sin errores.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
