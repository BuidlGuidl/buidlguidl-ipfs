interface DocsLinkProps {
  href: string;
  className?: string;
}

export function DocsLink({ href, className = "" }: DocsLinkProps) {
  return (
    <a
      href={href}
      className={`inline-block text-sm text-gray-400 hover:text-gray-300 ${className}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      → View docs
    </a>
  );
}
