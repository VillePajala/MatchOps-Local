/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */

// Mock for next/image that renders a simple img tag for testing
// Filters out Next.js-specific props that don't belong on standard img elements

const Image = ({
  src,
  alt,
  width,
  height,
  className,
  style,
  onClick,
  onLoad,
  onError,
  // Filter out Next.js-specific props
  priority,
  quality,
  placeholder,
  blurDataURL,
  loader,
  fill,
  sizes,
  unoptimized,
  ...rest
}) => {
  // eslint-disable-next-line jsx-a11y/alt-text, @next/next/no-img-element
  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      style={style}
      onClick={onClick}
      onLoad={onLoad}
      onError={onError}
      {...rest}
    />
  );
};

export default Image;
