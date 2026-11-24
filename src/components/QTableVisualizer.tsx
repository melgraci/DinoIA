import React, { useMemo, useState } from 'react';
import { ArrowRight, ArrowUp, Minus } from 'lucide-react';
import {
  describeStateDidactic,
  DISTANCE_LABELS,
  OBSTACLE_LABELS,
  QEntry,
  SPEED_LABELS,
} from '../engine/qLearning';

interface QTableVisualizerProps {
  entries: QEntry[];
  activeStateKey: string;
  updateSeq: number;
  totalUpdates: number;
}

type SpeedFilter = 'all' | 'normal' | 'fast';

export const QTableVisualizer: React.FC<QTableVisualizerProps> = ({
  entries,
  activeStateKey,
  updateSeq,
  totalUpdates,
}) => {
  const [speedFilter, setSpeedFilter] = useState<SpeedFilter>('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const filteredEntries = useMemo(() => {
    if (speedFilter === 'normal') return entries.filter((e) => e.speedTier === 0);
    if (speedFilter === 'fast') return entries.filter((e) => e.speedTier === 1);
    return entries;
  }, [entries, speedFilter]);

  const visitedCount = useMemo(
    () => entries.filter((e) => e.visitsRun > 0 || e.visitsJump > 0).length,
    [entries],
  );

  // Escala dinâmica para as barras visuais de Q-valor
  const maxAbsQ = useMemo(() => {
    let max = 20;
    for (const e of entries) {
      const a = Math.abs(e.qRun);
      const b = Math.abs(e.qJump);
      if (a > max) max = a;
      if (b > max) max = b;
    }
    return Math.min(100, max);
  }, [entries]);

  const inspectedEntry = useMemo(() => {
    const key = selectedKey ?? activeStateKey;
    return entries.find((e) => e.stateKey === key) ?? entries[0];
  }, [entries, selectedKey, activeStateKey]);

  const renderQCell = (
    value: number,
    isBest: boolean,
    justUpdated: boolean,
    lastDelta: number,
  ) => {
    const ratio = Math.min(1, Math.abs(value) / maxAbsQ);
    const isPositive = value > 0.01;
    const isNegative = value < -0.01;
    const barColor = isPositive
      ? 'bg-[#059669]'
      : isNegative
        ? 'bg-[#DC2626]'
        : 'bg-slate-300';
    const textColor = isPositive
      ? 'text-[#047857]'
      : isNegative
        ? 'text-[#B91C1C]'
        : 'text-slate-500';

    const flashClass = justUpdated
      ? lastDelta >= 0
        ? 'flash-positive'
        : 'flash-negative'
      : '';

    return (
      <div className={`px-2 py-1 rounded transition-colors ${flashClass}`}>
        <div className="flex items-center justify-between gap-2">
          <span
            className={`font-mono-tabular text-xs ${
              isBest ? 'font-bold' : 'font-medium'
            } ${textColor}`}
          >
            {value > 0 ? `+${value.toFixed(2)}` : value.toFixed(2)}
          </span>
        </div>
        <div className="mt-1 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-150 ${barColor}`}
            style={{ width: `${Math.max(value === 0 ? 0 : 4, ratio * 100)}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <section
      aria-label="Memória do Agente - Tabela Q-Learning"
      className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col h-full overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-900">
            Memória do Agente (Tabela Q)
          </h2>
          <p className="text-xs text-slate-500 font-mono-tabular mt-0.5">
            Estados explorados: {visitedCount}/{entries.length} · Atualizações:{' '}
            {totalUpdates}
          </p>
        </div>

        {/* Filtro de velocidade */}
        <div
          role="group"
          aria-label="Filtrar estados por velocidade"
          className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
        >
          {(
            [
              { id: 'all', label: 'Todos (20)' },
              { id: 'normal', label: 'Normal' },
              { id: 'fast', label: 'Rápida' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSpeedFilter(tab.id)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                speedFilter === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table Container */}
      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
            <tr>
              <th className="py-2 pl-4 pr-2">Estado (Distância · Obstáculo · Vel.)</th>
              <th className="py-2 px-2 w-[96px]">Q(Correr)</th>
              <th className="py-2 px-2 w-[96px]">Q(Saltar)</th>
              <th className="py-2 px-2 w-[92px]">Política</th>
              <th className="py-2 pl-2 pr-4 text-right w-[52px]">N</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {filteredEntries.map((entry) => {
              const isActive = entry.stateKey === activeStateKey;
              const isSelected = entry.stateKey === selectedKey;
              const totalVisits = entry.visitsRun + entry.visitsJump;
              const isIndecisive =
                totalVisits === 0 || Math.abs(entry.qRun - entry.qJump) < 0.05;
              const bestIsJump = !isIndecisive && entry.qJump > entry.qRun;
              const bestIsRun = !isIndecisive && entry.qRun >= entry.qJump;

              const recentlyUpdatedRun =
                entry.lastUpdateSeq === updateSeq &&
                entry.lastUpdatedAction === 0;
              const recentlyUpdatedJump =
                entry.lastUpdateSeq === updateSeq &&
                entry.lastUpdatedAction === 1;

              return (
                <tr
                  key={entry.stateKey}
                  onClick={() =>
                    setSelectedKey(
                      isSelected ? null : entry.stateKey,
                    )
                  }
                  className={`cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-[#0284C7]/10'
                      : isSelected
                        ? 'bg-slate-50'
                        : 'hover:bg-slate-50/80'
                  }`}
                >
                  <td className="py-2 pl-4 pr-2 align-middle">
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-medium ${
                          isActive ? 'text-[#0369A1]' : 'text-slate-900'
                        }`}
                      >
                        {DISTANCE_LABELS[entry.distBucket].name}
                      </span>
                      <span className="text-[11px] font-mono-tabular text-slate-400">
                        {DISTANCE_LABELS[entry.distBucket].short}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {OBSTACLE_LABELS[entry.obstacleKind]} ·{' '}
                      {SPEED_LABELS[entry.speedTier]}
                      {isActive ? ' · Ativo agora' : ''}
                    </div>
                  </td>

                  <td className="py-1.5 px-1 align-middle">
                    {renderQCell(
                      entry.qRun,
                      bestIsRun,
                      recentlyUpdatedRun,
                      entry.lastDelta,
                    )}
                  </td>

                  <td className="py-1.5 px-1 align-middle">
                    {renderQCell(
                      entry.qJump,
                      bestIsJump,
                      recentlyUpdatedJump,
                      entry.lastDelta,
                    )}
                  </td>

                  <td className="py-2 px-2 align-middle">
                    {isIndecisive ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 font-medium whitespace-nowrap">
                        <Minus className="w-3 h-3" />
                        Indeciso
                      </span>
                    ) : bestIsJump ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-[#0284C7] font-semibold whitespace-nowrap">
                        <ArrowUp className="w-3.5 h-3.5" />
                        SALTAR
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-[#059669] font-semibold whitespace-nowrap">
                        <ArrowRight className="w-3.5 h-3.5" />
                        CORRER
                      </span>
                    )}
                  </td>

                  <td className="py-2 pl-2 pr-4 align-middle text-right font-mono-tabular text-[11px] text-slate-500">
                    {totalVisits}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Inspetor de Estado selecionado ou ativo */}
      <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 text-xs space-y-1">
        <div className="flex items-center justify-between gap-2 text-slate-700 font-medium">
          <span>
            {selectedKey ? 'Estado inspecionado (clique novamente para seguir o agente)' : 'Estado atual em foco'}
          </span>
          <span className="font-mono-tabular text-slate-500">
            Correr: {inspectedEntry.visitsRun}× · Saltar: {inspectedEntry.visitsJump}×
          </span>
        </div>
        <p className="text-slate-600 leading-relaxed">
          {describeStateDidactic(inspectedEntry)}
        </p>
      </div>
    </section>
  );
};
