import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { gymData } from '../../home';

export interface ShiftSection {
  on: string;
  off: string;
  type: string;
}

export interface ShiftRow {
  no: number;
  name: string;
  sec1: ShiftSection;
  sec2: ShiftSection;
  sec3: ShiftSection;
  cutoff: string;
}

export interface HolidayRow {
  no: number;
  name: string;
  start: string;
  end: string;
  shift: string;
  timezone: string;
}

export interface BellRow {
  no: number;
  time: string;
  sun: boolean;
  mon: boolean;
  tue: boolean;
  wed: boolean;
  thu: boolean;
  fri: boolean;
  sat: boolean;
}

export interface QuestionEvent {
  no: number;
  info: string;
  required: string;
}

export interface QuestionConfig {
  single: string;
  title: string;
  voice: string;
  error: string;
  events: QuestionEvent[];
}

export interface DeviceSchedules {
  shifts: ShiftRow[];
  holidays: HolidayRow[];
  bells: BellRow[];
  question: QuestionConfig;
}

const file = gymData('device-schedules.json');

function blankSection(): ShiftSection {
  return { on: '', off: '', type: '0' };
}

function defaultSchedules(): DeviceSchedules {
  return {
    shifts: Array.from({ length: 8 }, (_, i) => ({
      no: i + 1,
      name: i === 0 ? 'shift1' : i === 1 ? 'shift2' : '',
      sec1: i === 0 ? { on: '08:30', off: '12:00', type: '0' } : blankSection(),
      sec2: i === 0 ? { on: '13:00', off: '17:00', type: '0' } : blankSection(),
      sec3: i === 0 ? { on: '18:00', off: '21:00', type: '1' } : blankSection(),
      cutoff: '',
    })),
    holidays: Array.from({ length: 12 }, (_, i) => ({
      no: i + 1,
      name: i === 0 ? 'New Year' : '',
      start: i === 0 ? '01-01' : '',
      end: i === 0 ? '01-01' : '',
      shift: '',
      timezone: '',
    })),
    bells: Array.from({ length: 12 }, (_, i) => ({
      no: i + 1,
      time: '',
      sun: true,
      mon: true,
      tue: true,
      wed: true,
      thu: true,
      fri: true,
      sat: true,
    })),
    question: {
      single: 'yes',
      title: '',
      voice: '',
      error: '',
      events: Array.from({ length: 9 }, (_, i) => ({ no: i + 1, info: '', required: '' })),
    },
  };
}

export function loadSchedules(): DeviceSchedules {
  const fallback = defaultSchedules();
  if (!existsSync(file)) return fallback;
  try {
    const saved = JSON.parse(readFileSync(file, 'utf8')) as Partial<DeviceSchedules>;
    return {
      shifts: saved.shifts?.length ? saved.shifts : fallback.shifts,
      holidays: saved.holidays?.length ? saved.holidays : fallback.holidays,
      bells: saved.bells?.length ? saved.bells : fallback.bells,
      question: saved.question ?? fallback.question,
    };
  } catch {
    return fallback;
  }
}

export function saveSchedules(next: DeviceSchedules): DeviceSchedules {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(next, null, 2));
  return next;
}
