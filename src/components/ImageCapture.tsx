import { useEffect, useRef, useState } from "react";
import { Camera, Check, ImagePlus, Loader2, RefreshCw, Upload, X } from "lucide-react";

interface ImageCaptureProps {
  onCapture: (imageData: string) => void;
  onClose: () => void;
}

export default function ImageCapture({ onCapture, onClose }: ImageCaptureProps) {
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startCamera = async (deviceId?: string) => {
    try {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId } }
          : { facingMode: "environment" },
      };
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
      setError(null);

      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const cams = allDevices.filter((d) => d.kind === "videoinput");
      setDevices(cams);
      if (!deviceId && cams[0]) setSelectedDeviceId(cams[0].deviceId);
    } catch {
      setError("Camera access was blocked. You can upload a photo instead.");
    }
  };

  useEffect(() => {
    startCamera();
    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const handleCapture = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setCapturedImage(dataUrl);
    if (stream) stream.getTracks().forEach((t) => t.stop());
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setCapturedImage(reader.result as string);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
    reader.readAsDataURL(file);
  };

  const handleConfirm = () => {
    if (!capturedImage) return;
    setUploading(true);
    onCapture(capturedImage);
  };

  const handleRetake = () => {
    setCapturedImage(null);
    startCamera(selectedDeviceId);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-lg p-4">
        <div className="rounded-2xl bg-gray-900 p-4 shadow-2xl ring-1 ring-white/10">
          {/* Header */}
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              <Camera className="h-5 w-5 text-emerald-400" />
              Identify by Photo
            </h2>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-800 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Camera / Preview area */}
          {capturedImage ? (
            <div className="relative overflow-hidden rounded-xl ring-1 ring-white/10">
              <img src={capturedImage} alt="Captured product" className="w-full" />
            </div>
          ) : (
            <>
              {devices.length > 1 && (
                <div className="mb-3 flex gap-2">
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => {
                      setSelectedDeviceId(e.target.value);
                      startCamera(e.target.value);
                    }}
                    className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                  >
                    {devices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || "Camera"}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => startCamera(selectedDeviceId)}
                    className="rounded-lg bg-gray-800 p-2 text-gray-300 hover:text-white"
                    title="Refresh camera"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                </div>
              )}
              <div className="relative overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full"
                  style={{ aspectRatio: "4/3" }}
                />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="rounded-lg border-2 border-emerald-400/60 px-8 py-6">
                    <p className="text-center text-xs text-emerald-400/80">Center the product here</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Action buttons */}
          {capturedImage ? (
            <div className="mt-3 flex gap-2">
              <button
                onClick={handleRetake}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gray-800 py-2.5 text-sm font-medium text-gray-300 transition hover:bg-gray-700"
              >
                <RefreshCw className="h-4 w-4" />
                Retake
              </button>
              <button
                onClick={handleConfirm}
                disabled={uploading}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Identifying...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Identify Product
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="mt-3 flex gap-2">
              <button
                onClick={handleCapture}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-400"
              >
                <Camera className="h-4 w-4" />
                Take Photo
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gray-800 py-2.5 text-sm font-medium text-gray-300 transition hover:bg-gray-700"
              >
                <ImagePlus className="h-4 w-4" />
                Upload Photo
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
          )}

          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
          <p className="mt-3 text-center text-xs text-gray-500">
            Take a clear photo of the product or its label/model number
          </p>
        </div>
      </div>
    </div>
  );
}
