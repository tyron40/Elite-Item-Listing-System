import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { Bluetooth, Camera, Check, Keyboard, RefreshCw, ScanLine, X } from "lucide-react";

interface BarcodeScannerProps {
  onDetected: (code: string) => void;
  onClose: () => void;
}

interface CameraDevice {
  deviceId: string;
  label: string;
}

type ScanMode = "camera" | "keyboard";

export default function BarcodeScanner({ onDetected, onClose }: BarcodeScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(true);
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [mode, setMode] = useState<ScanMode>("camera");
  const [scannerValue, setScannerValue] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  const loadDevices = async () => {
    try {
      const permissionStream = await navigator.mediaDevices.getUserMedia({ video: true });
      permissionStream.getTracks().forEach((track) => track.stop());
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const cameras = allDevices
        .filter((device) => device.kind === "videoinput")
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${index + 1}`,
        }));
      setDevices(cameras);
      if (!selectedDeviceId && cameras[0]) setSelectedDeviceId(cameras[0].deviceId);
    } catch {
      setError("Camera access was blocked. You can still use a Bluetooth or USB barcode scanner below.");
      setMode("keyboard");
    }
  };

  useEffect(() => {
    loadDevices();
  }, []);

  useEffect(() => {
    if (mode !== "camera" || !selectedDeviceId || !videoRef.current) return;
    let cancelled = false;
    setError(null);
    setScanning(true);
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
      BarcodeFormat.QR_CODE,
    ]);
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 200 });

    reader.decodeFromVideoDevice(selectedDeviceId, videoRef.current, (result) => {
      if (result && !cancelled) {
        setScanning(false);
        controlsRef.current?.stop();
        onDetectedRef.current(result.getText());
      }
    }).then((controls) => {
      if (cancelled) controls.stop();
      else controlsRef.current = controls;
    }).catch(() => {
      if (!cancelled) setError("This camera could not be opened. Try another connected camera.");
    });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [mode, selectedDeviceId]);

  const submitKeyboardScan = () => {
    const value = scannerValue.trim();
    if (value) {
      setScanning(false);
      onDetectedRef.current(value);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-lg p-4">
        <div className="rounded-2xl bg-gray-900 p-4 shadow-2xl ring-1 ring-white/10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              <ScanLine className="h-5 w-5 text-emerald-400" />
              Scan Barcode
            </h2>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-800 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2">
            <button
              onClick={() => { setMode("camera"); setError(null); }}
              className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${mode === "camera" ? "bg-emerald-500 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}
            >
              <Camera className="h-4 w-4" /> Camera
            </button>
            <button
              onClick={() => { setMode("keyboard"); setError(null); }}
              className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${mode === "keyboard" ? "bg-emerald-500 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}
            >
              <Bluetooth className="h-4 w-4" /> Bluetooth / USB
            </button>
          </div>

          {mode === "camera" ? (
            <>
              <div className="mb-3 flex gap-2">
                <select
                  value={selectedDeviceId}
                  onChange={(event) => setSelectedDeviceId(event.target.value)}
                  disabled={devices.length === 0}
                  className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                >
                  {devices.length === 0 ? <option>Finding connected cameras...</option> : devices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
                </select>
                <button onClick={loadDevices} className="rounded-lg bg-gray-800 p-2 text-gray-300 hover:text-white" title="Refresh cameras">
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
              <div className="relative overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
                <video ref={videoRef} className="w-full" style={{ aspectRatio: "4/3" }} />
                {scanning && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="h-1 w-3/4 animate-pulse rounded-full bg-emerald-400/80 shadow-lg shadow-emerald-400/50" /></div>}
              </div>
              <p className="mt-3 text-center text-sm text-gray-400">{scanning ? "Point the selected camera at a barcode..." : "Barcode detected!"}</p>
            </>
          ) : (
            <div className="rounded-xl border border-gray-700 bg-gray-800/70 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm text-gray-300"><Keyboard className="h-4 w-4 text-emerald-400" />Connected scanners that type like a keyboard work here</div>
              <input
                autoFocus
                value={scannerValue}
                onChange={(event) => setScannerValue(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); submitKeyboardScan(); } }}
                placeholder="Scan a barcode, then press Enter..."
                className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-3 text-sm text-white placeholder-gray-500 outline-none focus:border-emerald-400"
              />
              <button onClick={submitKeyboardScan} disabled={!scannerValue.trim()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-40"><Check className="h-4 w-4" /> Use scanned code</button>
              <p className="mt-3 text-xs leading-relaxed text-gray-400">Pair the Bluetooth scanner with your computer first. Most scanners automatically send the barcode into this field and press Enter.</p>
            </div>
          )}

          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        </div>
      </div>
    </div>
  );
}
