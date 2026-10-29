import { TONE } from './ui';

/**
 * The member's own portal photo wherever his name appears in the admin. Without a photo
 * the gold initial keeps the row shape identical, so lists never jump.
 */
export default function MemberAvatar({
  name,
  photoPath,
  className = 'w-9 h-9 rounded-xl',
  letterClassName = 'text-sm font-bold',
  tone = TONE.members
}: {
  name: string;
  photoPath?: string | null;
  className?: string;
  letterClassName?: string;
  tone?: string;
}) {
  if (photoPath) {
    return <img src={photoPath} alt="" className={`shrink-0 object-cover bg-dark-elevate ${className}`} />;
  }

  return (
    <div
      className={`flex items-center justify-center shrink-0 ${className}`}
      style={{ backgroundColor: `${tone}14`, color: tone }}
    >
      <span className={letterClassName}>{name.trim().charAt(0)}</span>
    </div>
  );
}
