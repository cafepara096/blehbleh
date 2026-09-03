import { useMemo, useState } from 'react';
import type { Character } from '../../types/dnd';
import {
  getBarbarianRageMax,
  getBarbarianRageDamage,
  getBarbarianWeaponMasteryCount,
  BRUTAL_STRIKE_OPTIONS,
  WILD_HEART_RAGE,
  WILD_HEART_ASPECT,
  WILD_HEART_POWER,
  WEAPON_MASTERY_MELEE,
  type TableOption,
} from '../../data/featureTables';

interface Props {
  character: Character;
  onUpdate: (partial: Partial<Character>) => void;
}

type BarbPrefs = NonNullable<Character['barbarianPrefs']>;

function readPrefs(character: Character): BarbPrefs {
  return character.barbarianPrefs || {};
}

export function BarbarianPanel({ character, onUpdate }: Props) {
  const classId = (character.classId || '').toLowerCase();
  const className = (character.class || '').toLowerCase();
  const isBarb =
    classId === 'barbarian' ||
    className.includes('bárbaro') ||
    className.includes('barbaro') ||
    className.includes('barbarian');

  if (!isBarb) return null;

  const level = character.level;
  const rageMax = getBarbarianRageMax(level);
  const rageDmg = getBarbarianRageDamage(level);
  const masterySlots = getBarbarianWeaponMasteryCount(level);

  const rageFeature = character.features.find(
    (f) => f.id === 'barb-rage' || f.name === 'Furia'
  );
  const rageCurrent = rageFeature?.uses?.current ?? rageMax;

  const prefs = readPrefs(character);
  const subId = (character.subclassId || '').toLowerCase();
  const subName = (character.subclass || '').toLowerCase();
  const isWildHeart =
    subId === 'wild-heart' ||
    subName.includes('corazón salvaje') ||
    subName.includes('corazon salvaje');
  const isZealot =
    subId === 'zealot' || subName.includes('fanático') || subName.includes('fanatico');
  const hasBrutalStrike = level >= 9;

  const [showMastery, setShowMastery] = useState(false);
  const [brutalMenuOpen, setBrutalMenuOpen] = useState(false);

  const setPrefs = (next: BarbPrefs) => {
    onUpdate({ barbarianPrefs: { ...prefs, ...next } });
  };

  const setRageUses = (current: number) => {
    if (!rageFeature) {
      // ensure feature exists with uses
      onUpdate({
        features: [
          ...character.features,
          {
            id: 'barb-rage',
            name: 'Furia',
            description: 'Furia de bárbaro',
            source: 'class',
            level: 1,
            uses: { current: Math.max(0, Math.min(rageMax, current)), max: rageMax, recovery: 'short' },
          },
        ],
      });
      return;
    }
    onUpdate({
      features: character.features.map((f) =>
        f.id === rageFeature.id
          ? {
              ...f,
              uses: {
                current: Math.max(0, Math.min(rageMax, current)),
                max: rageMax,
                recovery: 'short',
                baseMax: 2,
              },
            }
          : f
      ),
    });
  };

  const enterRage = () => {
    if (rageCurrent <= 0) {
      alert('No te quedan usos de Furia.');
      return;
    }
    setRageUses(rageCurrent - 1);
    setPrefs({ raging: true });
  };

  const endRage = () => setPrefs({ raging: false });

  const toggleMastery = (id: string) => {
    const cur = new Set(prefs.weaponMastery || []);
    if (cur.has(id)) cur.delete(id);
    else {
      if (cur.size >= masterySlots) {
        alert(`Solo puedes tener ${masterySlots} maestrías a este nivel.`);
        return;
      }
      cur.add(id);
    }
    setPrefs({ weaponMastery: Array.from(cur) });
  };

  const warriorDice = character.features.find((f) => f.id === 'ze-3-warrior');

  const knownMastery = useMemo(() => {
    const ids = prefs.weaponMastery || [];
    return WEAPON_MASTERY_MELEE.filter((w) => ids.includes(w.id));
  }, [prefs.weaponMastery]);

  return (
    <div className="space-y-2">
      <div className="bg-red-50 border-2 border-red-400 rounded-xl p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-red-950 text-base">Furia</span>
          <span className="font-mono font-bold">
            {rageCurrent}/{rageMax}
          </span>
          <span className="text-xs text-red-900/80">Daño por furia +{rageDmg}</span>
          {prefs.raging && (
            <span className="text-[10px] font-bold bg-red-600 text-white px-2 py-0.5 rounded-full animate-pulse">
              ENFURECIDO
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <button
            type="button"
            onClick={enterRage}
            className="px-2.5 py-1 bg-red-700 text-white rounded-lg text-xs font-bold hover:bg-red-600"
          >
            Entrar en furia (−1)
          </button>
          <button
            type="button"
            onClick={endRage}
            className="px-2.5 py-1 border border-red-400 rounded-lg text-xs font-bold"
          >
            Terminar furia
          </button>
          <button type="button" onClick={() => setRageUses(rageCurrent - 1)} className="px-2 py-1 border rounded text-xs">
            −
          </button>
          <button type="button" onClick={() => setRageUses(rageCurrent + 1)} className="px-2 py-1 border rounded text-xs">
            +
          </button>
          <button
            type="button"
            onClick={() => setRageUses(rageMax)}
            className="px-2 py-1 bg-red-100 border border-red-300 rounded text-xs"
          >
            Recuperar todos
          </button>
        </div>
        <p className="text-[10px] text-ink-600 mt-2">
          Recuperas 1 uso en descanso corto y todos en descanso largo. Sin armadura pesada. Resistencia a
          contundente/cortante/perforante; ventaja en Fue; no concentración ni conjuros. Duración hasta el
          final de tu siguiente turno (máx. 10 min); prolongable atacando, forzando salvación o con acción
          adicional.
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-400 rounded-lg p-2.5 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-amber-950">Maestría con armas</span>
          <span className="text-amber-900/80">
            {(prefs.weaponMastery || []).length}/{masterySlots}
          </span>
          <button type="button" onClick={() => setShowMastery((v) => !v)} className="underline text-amber-800">
            {showMastery ? 'Cerrar' : 'Elegir / editar'}
          </button>
        </div>
        {knownMastery.length > 0 && (
          <ul className="mt-1 flex flex-wrap gap-1">
            {knownMastery.map((w) => (
              <li key={w.id} className="bg-white border border-amber-200 rounded px-1.5 py-0.5 text-[10px]">
                {w.name}
              </li>
            ))}
          </ul>
        )}
        {showMastery && (
          <div className="mt-1 max-h-36 overflow-y-auto space-y-0.5 border-t border-amber-200 pt-1">
            {WEAPON_MASTERY_MELEE.map((w) => (
              <label
                key={w.id}
                className="flex gap-2 items-start cursor-pointer hover:bg-amber-100/50 rounded px-1"
              >
                <input
                  type="checkbox"
                  checked={(prefs.weaponMastery || []).includes(w.id)}
                  onChange={() => toggleMastery(w.id)}
                  className="mt-0.5"
                />
                <span>
                  <strong>{w.name}</strong> — {w.description}
                </span>
              </label>
            ))}
            <p className="text-[10px] text-ink-500 pt-1">
              Tras un descanso largo puedes cambiar una elección. Homebrew: amplía el catálogo en datos.
            </p>
          </div>
        )}
      </div>

      {hasBrutalStrike && (
        <div className="bg-orange-50 border border-orange-400 rounded-lg p-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-orange-950">Golpe brutal</span>
            <span className="text-orange-900/80">
              {level >= 17 ? '2d10 · 2 efectos' : level >= 13 ? '1d10 · opciones +13' : '1d10'}
            </span>
            <button
              type="button"
              onClick={() => setBrutalMenuOpen((v) => !v)}
              className="underline text-orange-800"
            >
              {brutalMenuOpen ? 'Ocultar' : 'Opciones'}
            </button>
          </div>
          {prefs.lastBrutal && (
            <p className="mt-1 text-[11px] bg-white border border-orange-200 rounded px-1.5 py-1">
              Último: {prefs.lastBrutal}
            </p>
          )}
          {brutalMenuOpen && (
            <div className="mt-1 space-y-1 border-t border-orange-200 pt-1">
              {BRUTAL_STRIKE_OPTIONS.filter((o) => {
                if (o.id === 'staggering' || o.id === 'sundering') return level >= 13;
                return true;
              }).map((o: TableOption) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setPrefs({ lastBrutal: o.name })}
                  className="block w-full text-left bg-white border border-orange-100 rounded px-1.5 py-1 hover:bg-orange-100"
                >
                  <strong>{o.name}</strong>
                  <span className="block text-[10px] text-ink-600">{o.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {isWildHeart && (
        <div className="bg-green-50 border border-green-400 rounded-lg p-2.5 text-xs space-y-2">
          <p className="font-bold text-green-950">Corazón salvaje — elecciones</p>
          <div>
            <p className="text-[10px] font-semibold mb-0.5">Furia de lo salvaje (al enfurecerte)</p>
            <div className="flex flex-wrap gap-1">
              {WILD_HEART_RAGE.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setPrefs({ wildHeartRage: o.id })}
                  className={`px-2 py-1 rounded border text-[10px] ${
                    prefs.wildHeartRage === o.id
                      ? 'bg-green-700 text-white border-green-800'
                      : 'bg-white border-green-300'
                  }`}
                  title={o.description}
                >
                  {o.name}
                </button>
              ))}
            </div>
            {prefs.wildHeartRage && (
              <p className="text-[10px] text-ink-600 mt-0.5">
                {WILD_HEART_RAGE.find((o) => o.id === prefs.wildHeartRage)?.description}
              </p>
            )}
          </div>
          {level >= 6 && (
            <div>
              <p className="text-[10px] font-semibold mb-0.5">Aspecto de lo salvaje (cambia en descanso largo)</p>
              <div className="flex flex-wrap gap-1">
                {WILD_HEART_ASPECT.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setPrefs({ wildHeartAspect: o.id })}
                    className={`px-2 py-1 rounded border text-[10px] ${
                      prefs.wildHeartAspect === o.id
                        ? 'bg-green-700 text-white border-green-800'
                        : 'bg-white border-green-300'
                    }`}
                    title={o.description}
                  >
                    {o.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {level >= 14 && (
            <div>
              <p className="text-[10px] font-semibold mb-0.5">Poder de lo salvaje (al enfurecerte)</p>
              <div className="flex flex-wrap gap-1">
                {WILD_HEART_POWER.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setPrefs({ wildHeartPower: o.id })}
                    className={`px-2 py-1 rounded border text-[10px] ${
                      prefs.wildHeartPower === o.id
                        ? 'bg-green-700 text-white border-green-800'
                        : 'bg-white border-green-300'
                    }`}
                    title={o.description}
                  >
                    {o.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {isZealot && warriorDice?.uses && (
        <div className="bg-yellow-50 border border-yellow-400 rounded-lg p-2.5 text-xs">
          <span className="font-bold text-yellow-950">Guerrero de los dioses</span>
          <span className="ml-2 font-mono">
            {warriorDice.uses.current}/{warriorDice.uses.max} d12
          </span>
          <p className="text-[10px] text-ink-600 mt-0.5">
            Acción adicional: gasta dados de la reserva y recuperas PG = total. Recarga en descanso largo.
          </p>
        </div>
      )}

      <p className="text-[10px] text-ink-500">
        Rasgos de clase y subclase se añaden o quitan al gestionar niveles. Puedes editar o crear sendas y
        rasgos como homebrew en Clases.
      </p>
    </div>
  );
}
