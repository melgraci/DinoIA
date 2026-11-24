import React from 'react';
import { ACTION_LABELS, BellmanUpdateRecord } from '../engine/qLearning';
import { EpisodeSummary } from '../engine/dinoSimulation';

interface BellmanInspectorProps {
  lastBellman: BellmanUpdateRecord | null;
  episodeHistory: EpisodeSummary[];
  bestScore: number;
}

export const BellmanInspector: React.FC<BellmanInspectorProps> = ({
  lastBellman,
  episodeHistory,
  bestScore,
}) => {
  // Calcula média móvel dos últimos 5 episódios
  const recentAvg = React.useMemo(() => {
    if (episodeHistory.length === 0) return 0;
    const slice = episodeHistory.slice(-5);
    const sum = slice.reduce((acc, item) => acc + item.score, 0);
    return Math.round(sum / slice.length);
  }, [episodeHistory]);

  // Prepara pontos do gráfico SVG
  const chartData = React.useMemo(() => {
    const items = episodeHistory.slice(-40);
    if (items.length === 0) return null;

    const maxScore = Math.max(40, ...items.map((i) => i.score));
    const width = 420;
    const height = 104;
    const padX = 28;
    const padY = 12;
    const usableW = width - padX * 2;
    const usableH = height - padY * 2;

    const points = items.map((item, idx) => {
      const x =
        items.length === 1
          ? padX + usableW / 2
          : padX + (idx / (items.length - 1)) * usableW;
      const y = padY + usableH - (item.score / maxScore) * usableH;

      // Média móvel de 5 episódios até idx
      const start = Math.max(0, idx - 4);
      const windowSlice = items.slice(start, idx + 1);
      const avg =
        windowSlice.reduce((s, w) => s + w.score, 0) / windowSlice.length;
      const avgY = padY + usableH - (avg / maxScore) * usableH;

      return { x, y, avgY, score: item.score, episode: item.episode };
    });

    const avgPath = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.avgY.toFixed(1)}`)
      .join(' ');

    return { width, height, padX, padY, usableH, maxScore, points, avgPath };
  }, [episodeHistory]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Equação de Bellman ao Vivo */}
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex flex-col justify-between gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-sm font-semibold text-slate-900">
            Atualização de Bellman ao Vivo
          </h3>
          {lastBellman && (
            <span
              className={`font-mono-tabular text-xs font-semibold ${
                lastBellman.reward > 1
                  ? 'text-[#059669]'
                  : lastBellman.reward < -10
                    ? 'text-[#DC2626]'
                    : lastBellman.reward < 0
                      ? 'text-[#D97706]'
                      : 'text-slate-600'
              }`}
            >
              {lastBellman.reason}
            </span>
          )}
        </div>

        <div className="bg-slate-50 border border-slate-200/80 rounded-lg px-3 py-2 font-mono-tabular text-[11px] text-slate-700 overflow-x-auto whitespace-nowrap">
          Q(s, a) ← Q(s, a) + α · [ r + γ · máx Q(s&apos;, a&apos;) − Q(s, a) ]
        </div>

        {lastBellman ? (
          <div className="space-y-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 text-slate-600">
              <span>
                <strong className="text-slate-900">s:</strong>{' '}
                {lastBellman.stateLabel}
              </span>
              <span className="font-mono-tabular">
                <strong className="text-slate-900">a:</strong>{' '}
                {ACTION_LABELS[lastBellman.action]}
                {lastBellman.wasExploration ? ' (Exploração)' : ' (Política)'}
              </span>
            </div>

            <div className="font-mono-tabular text-[11px] bg-slate-50 rounded-md px-2.5 py-2 text-slate-800 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>
                {lastBellman.oldQ.toFixed(2)} + {lastBellman.alpha.toFixed(2)} ·
                [ {lastBellman.reward > 0 ? `+${lastBellman.reward}` : lastBellman.reward} +{' '}
                {lastBellman.gamma.toFixed(2)} · {lastBellman.maxNextQ.toFixed(2)} −{' '}
                {lastBellman.oldQ.toFixed(2)} ]
              </span>
              <span className="font-bold text-[#0284C7]">
                = {lastBellman.newQ.toFixed(2)}
              </span>
              <span
                className={`ml-auto font-semibold ${
                  lastBellman.delta >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'
                }`}
              >
                (Δ {lastBellman.delta >= 0 ? '+' : ''}
                {lastBellman.delta.toFixed(2)})
              </span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500 py-3">
            Aguardando a primeira transição de decisão do agente para calcular a atualização da Tabela Q.
          </p>
        )}
      </section>

      {/* Curva de Aprendizagem */}
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex flex-col justify-between gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-sm font-semibold text-slate-900">
            Evolução da Pontuação por Episódio
          </h3>
          <div className="text-xs text-slate-500 font-mono-tabular">
            Média (5 ep): <strong className="text-slate-900">{recentAvg}</strong> · Recorde:{' '}
            <strong className="text-[#0284C7]">{bestScore}</strong>
          </div>
        </div>

        {chartData ? (
          <div className="w-full">
            <svg
              viewBox={`0 0 ${chartData.width} ${chartData.height}`}
              className="w-full h-[104px] overflow-visible"
              aria-label="Gráfico de evolução da pontuação do agente por episódio"
            >
              {/* Linhas horizontais de referência */}
              <line
                x1={chartData.padX}
                y1={chartData.padY}
                x2={chartData.width - chartData.padX}
                y2={chartData.padY}
                stroke="#E2E8F0"
                strokeDasharray="3 3"
              />
              <line
                x1={chartData.padX}
                y1={chartData.padY + chartData.usableH}
                x2={chartData.width - chartData.padX}
                y2={chartData.padY + chartData.usableH}
                stroke="#CBD5E1"
              />
              <text
                x={chartData.padX - 4}
                y={chartData.padY + 4}
                textAnchor="end"
                fontSize="9"
                fill="#64748B"
                fontFamily="JetBrains Mono, monospace"
              >
                {chartData.maxScore}
              </text>
              <text
                x={chartData.padX - 4}
                y={chartData.padY + chartData.usableH}
                textAnchor="end"
                fontSize="9"
                fill="#64748B"
                fontFamily="JetBrains Mono, monospace"
              >
                0
              </text>

              {/* Pontos individuais dos episódios */}
              {chartData.points.map((pt) => (
                <circle
                  key={pt.episode}
                  cx={pt.x}
                  cy={pt.y}
                  r="2.4"
                  fill="#94A3B8"
                  opacity="0.7"
                />
              ))}

              {/* Linha de média móvel */}
              <path
                d={chartData.avgPath}
                fill="none"
                stroke="#0284C7"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
              <span>Pontos cinza: pontuação do episódio · Linha azul: média móvel</span>
              <span className="font-mono-tabular">
                Últimos {Math.min(40, episodeHistory.length)} ep.
              </span>
            </div>
          </div>
        ) : (
          <div className="h-[104px] flex items-center justify-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg">
            Complete o primeiro episódio para visualizar a curva de aprendizagem.
          </div>
        )}
      </section>
    </div>
  );
};
