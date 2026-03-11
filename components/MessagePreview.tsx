interface MessagePreviewProps {
  text: string;
  direction?: "rtl" | "ltr";
}

export default function MessagePreview({ text, direction = "rtl" }: MessagePreviewProps) {
  return (
    <div className="bg-gray-100 rounded-xl p-4 max-w-sm">
      <div
        dir={direction}
        className="bg-[#DCF8C6] rounded-lg rounded-tl-none px-3 py-2 shadow-sm text-sm leading-relaxed"
      >
        {text}
        <div className="flex justify-end mt-1">
          <span className="text-[10px] text-gray-500">12:00</span>
        </div>
      </div>
    </div>
  );
}
