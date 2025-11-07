import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

interface ZoomableImageProps {
  src: string;
  alt: string;
  className?: string;
}

export default function ZoomableImage({ src, alt, className = '' }: ZoomableImageProps) {
  return (
    <div className={`absolute inset-0 ${className}`} data-testid="zoomable-image-container">
      <TransformWrapper
        initialScale={1}
        minScale={1}
        maxScale={4}
        wheel={{ step: 0.1 }}
        pinch={{ step: 5 }}
        doubleClick={{ disabled: false, mode: "reset" }}
        panning={{ velocityDisabled: true }}
      >
        <TransformComponent
          wrapperClass="!w-full !h-full"
          contentClass="!w-full !h-full"
        >
          <img
            src={src}
            alt={alt}
            className="w-full h-full object-cover select-none"
            draggable={false}
            data-testid="img-tutorial"
          />
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}
