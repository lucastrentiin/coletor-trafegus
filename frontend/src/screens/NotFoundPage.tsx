import { Link } from 'react-router';
import { Compass } from 'lucide-react';
import { EmptyState } from '@/components/ui/feedback';

export function NotFoundPage() {
  return (
    <EmptyState
      icon={<Compass />}
      title="Página não encontrada"
      description="O endereço pode ter mudado com a nova interface."
      action={
        <Link to="/" className="text-sm font-medium text-ink underline underline-offset-4">
          Voltar ao painel
        </Link>
      }
    />
  );
}
