import React from 'react';
import { Play, Gamepad2 } from 'lucide-react';
import { ControlMode } from '../engine/dinoSimulation';

interface TitleScreenProps {
  onStart: (mode: ControlMode) => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({ onStart }) => {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#F4F5F7]/92 backdrop-blur-[2px] p-6">
      <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-12 items-stretch">
          {/* Left: Title & Educational Hook */}
          <div className="md:col-span-7 p-8 md:p-10 flex flex-col justify-between gap-8">
            <div className="space-y-4">
              <p className="text-xs font-medium tracking-wide text-[#0284C7]">
                Laboratório de Aprendizagem por Reforço
              </p>
              <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-slate-900 text-balance">
                Dino Q-Learning Lab
              </h1>
              <p className="text-[15px] leading-relaxed text-slate-600 max-w-prose">
                Acompanhe um agente autônomo que só pode{' '}
                <strong className="font-semibold text-slate-900">correr</strong>{' '}
                e{' '}
                <strong className="font-semibold text-slate-900">saltar</strong>{' '}
                aprender por tentativa e erro. Veja cada estado discretizado e
                os valores armazenados na Tabela Q se atualizarem ao vivo.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-2 border-t border-slate-100">
              <div>
                <div className="font-mono-tabular text-lg font-semibold text-slate-900">
                  20 Estados
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  5 distâncias · 2 cactos · 2 velocidades
                </div>
              </div>
              <div>
                <div className="font-mono-tabular text-lg font-semibold text-slate-900">
                  2 Ações
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Correr ou Saltar no solo
                </div>
              </div>
              <div>
                <div className="font-mono-tabular text-lg font-semibold text-slate-900">
                  Tempo Real
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Memória Q e Equação de Bellman
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onStart('agent')}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0284C7]"
                >
                  <Play className="w-4 h-4" />
                  Iniciar Treino do Agente
                </button>
                <button
                  type="button"
                  onClick={() => onStart('manual')}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
                >
                  <Gamepad2 className="w-4 h-4" />
                  Jogar Manualmente
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Enter ou Espaço para iniciar · Espaço ou Seta para Cima salta no modo manual · P pausa
              </p>
            </div>
          </div>

          {/* Right: Atmospheric Vector Key Art Lockup */}
          <div className="md:col-span-5 bg-[#F8F5EE] border-t md:border-t-0 md:border-l border-slate-200 p-8 flex flex-col justify-between">
            <div className="text-xs font-mono-tabular text-slate-500 flex items-center justify-between">
              <span>Política ε-greedy</span>
              <span>Q(s, a)</span>
            </div>

            <div className="my-6 flex items-center justify-center">
              <svg
                viewBox="0 0 280 180"
                className="w-full h-auto max-w-[280px]"
                aria-label="Ilustração vetorial do dinossauro medindo distância até o cacto"
              >
                {/* Sky horizon */}
                <line
                  x1="12"
                  y1="146"
                  x2="268"
                  y2="146"
                  stroke="#9E937E"
                  strokeWidth="2"
                />
                {/* Distance sensor line */}
                <line
                  x1="96"
                  y1="126"
                  x2="206"
                  y2="126"
                  stroke="#0284C7"
                  strokeWidth="1.75"
                  strokeDasharray="4 4"
                />
                <rect
                  x="126"
                  y="108"
                  width="50"
                  height="16"
                  rx="3"
                  fill="#FFFFFF"
                  stroke="#0284C7"
                  strokeWidth="1"
                />
                <text
                  x="151"
                  y="119"
                  textAnchor="middle"
                  fill="#0284C7"
                  fontSize="9"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="600"
                >
                  Ideal
                </text>

                {/* Jump arc preview */}
                <path
                  d="M 70 112 Q 145 36 226 112"
                  fill="none"
                  stroke="#059669"
                  strokeWidth="1.75"
                  strokeDasharray="5 4"
                />

                {/* Dino */}
                <g transform="translate(54, 146)">
                  <polygon points="-14,-18 -24,-26 -22,-16 -12,-11" fill="#1E293B" />
                  <rect x="-14" y="-28" width="22" height="19" rx="5" fill="#1E293B" />
                  <rect x="-2" y="-44" width="21" height="17" rx="4" fill="#1E293B" />
                  <rect x="4" y="-31" width="14" height="3" fill="#334155" />
                  <rect x="-10" y="-31" width="4" height="3" fill="#0284C7" />
                  <rect x="9" y="-40" width="4" height="4" fill="#FFFFFF" />
                  <rect x="11" y="-39" width="2" height="2" fill="#0F172A" />
                  <rect x="-9" y="-10" width="5" height="10" fill="#1E293B" />
                  <rect x="1" y="-10" width="5" height="7" fill="#1E293B" />
                </g>

                {/* Cactus */}
                <g transform="translate(208, 146)">
                  <rect x="7" y="-42" width="9" height="42" rx="4" fill="#15803D" />
                  <rect x="0" y="-28" width="9" height="5" rx="2" fill="#15803D" />
                  <rect x="0" y="-37" width="5" height="12" rx="2" fill="#15803D" />
                  <rect x="14" y="-22" width="9" height="5" rx="2" fill="#15803D" />
                  <rect x="18" y="-33" width="5" height="14" rx="2" fill="#15803D" />
                </g>
              </svg>
            </div>

            <div className="space-y-1.5 text-xs text-slate-600">
              <div className="flex justify-between font-mono-tabular">
                <span>Superar obstáculo</span>
                <span className="font-semibold text-[#059669]">+15.0</span>
              </div>
              <div className="flex justify-between font-mono-tabular">
                <span>Corrida segura</span>
                <span className="font-semibold text-slate-700">+0.4</span>
              </div>
              <div className="flex justify-between font-mono-tabular">
                <span>Salto no vazio</span>
                <span className="font-semibold text-[#D97706]">-3.0</span>
              </div>
              <div className="flex justify-between font-mono-tabular">
                <span>Colisão com cacto</span>
                <span className="font-semibold text-[#DC2626]">-100.0</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
