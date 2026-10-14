import { useId, useRef, useState } from 'react';
import { FileKey2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface SshKeyInputProps {
  hasSavedKey: boolean;
  onLoad: (content: string) => void;
}

const MAX_KEY_SIZE = 64 * 1024;

/**
 * Lê o arquivo da chave no navegador e envia o conteúdo. Aceita .ppk (PuTTY)
 * ou OpenSSH/PEM; o servidor identifica e converte.
 */
export function SshKeyInput({ hasSavedKey, onLoad }: SshKeyInputProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-line-strong px-3 py-2.5">
      <FileKey2 className="size-4 shrink-0 text-ink-3" aria-hidden />
      <p className="min-w-0 flex-1 text-xs text-ink-2">
        {fileName ? (
          <>
            Carregada: <span className="font-mono text-ink">{fileName}</span>
          </>
        ) : hasSavedKey ? (
          'Há uma chave salva. Escolha um arquivo só se quiser trocar.'
        ) : (
          'Nenhuma chave carregada. Aceita .ppk ou OpenSSH/PEM.'
        )}
      </p>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        className="sr-only"
        accept=".ppk,.pem,.key,.txt,application/x-pem-file,text/plain"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          if (file.size > MAX_KEY_SIZE) {
            toast.error('Arquivo grande demais para ser uma chave SSH.');
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            onLoad(String(reader.result ?? ''));
            setFileName(file.name);
          };
          reader.onerror = () => toast.error(`Não foi possível ler "${file.name}".`);
          reader.readAsText(file);
        }}
      />
      <Button size="sm" icon={<Upload className="size-3.5" />} onClick={() => inputRef.current?.click()}>
        {fileName || hasSavedKey ? 'Trocar arquivo' : 'Escolher arquivo'}
      </Button>
    </div>
  );
}
