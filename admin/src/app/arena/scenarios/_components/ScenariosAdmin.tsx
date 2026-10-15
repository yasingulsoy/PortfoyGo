'use client';

import { useRef, useState } from 'react';
import { PlusIcon } from '@heroicons/react/20/solid';
import Button from '@portfoygo/shared/ui/Button';
import type { AdminScenario } from '@/lib/types';
import { useScenarioList, useSeriesList } from './data';
import SeriesImport from './SeriesImport';
import SeriesTable from './SeriesTable';
import ScenarioEditor from './ScenarioEditor';
import ScenarioList from './ScenarioList';

/** Senaryo yönetimi: seri içe aktarma + seri tablosu + senaryo düzenleyici + senaryo listesi. */
export default function ScenariosAdmin() {
  const series = useSeriesList();
  const scenarios = useScenarioList();
  const [editing, setEditing] = useState<AdminScenario | null>(null);
  /** Düzenleyiciyi sıfırlamak için anahtar (yeni senaryo / farklı senaryo) */
  const [editorKey, setEditorKey] = useState(0);
  const editorRef = useRef<HTMLDivElement>(null);

  const refreshAll = () => {
    void series.mutate();
    void scenarios.mutate();
  };

  const startEdit = (s: AdminScenario | null) => {
    setEditing(s);
    setEditorKey((k) => k + 1);
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
        <SeriesImport onImported={() => void series.mutate()} />
        <SeriesTable list={series} onChanged={refreshAll} />
      </div>

      <div ref={editorRef} className="scroll-mt-24 space-y-3">
        {editing && (
          <div className="flex justify-end">
            <Button variant="secondary" size="sm" onClick={() => startEdit(null)} icon={<PlusIcon className="h-4 w-4" aria-hidden="true" />}>
              Yeni senaryo
            </Button>
          </div>
        )}
        <ScenarioEditor
          key={editorKey}
          series={series.items}
          scenario={editing}
          onSaved={() => {
            setEditing(null);
            setEditorKey((k) => k + 1);
            refreshAll();
          }}
          onCancel={editing ? () => startEdit(null) : undefined}
        />
      </div>

      <ScenarioList list={scenarios} editingId={editing?.id ?? null} onEdit={startEdit} onChanged={refreshAll} />
    </div>
  );
}
