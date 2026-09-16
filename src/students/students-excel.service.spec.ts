import {
  computeSyncDiff,
  SyncRow,
  ActiveStudentForDiff,
} from './students-excel.service';

function row(
  overrides: Partial<SyncRow & { classId: string }>,
): SyncRow & { classId: string } {
  return {
    row: 2,
    name: 'Test Siswa',
    nis: '0001',
    grade: 'X',
    className: 'RPL 1',
    classId: 'class-x-rpl-1',
    ...overrides,
  };
}

function activeStudent(
  overrides: Partial<ActiveStudentForDiff>,
): ActiveStudentForDiff {
  return {
    id: 'student-1',
    nis: '0001',
    name: 'Test Siswa',
    classId: 'class-x-rpl-1',
    class: { grade: 'X', name: 'RPL 1' },
    ...overrides,
  };
}

describe('computeSyncDiff', () => {
  it('mendeteksi siswa baru sebagai toCreate ketika NIS belum ada di DB', () => {
    const rows = [row({ nis: '9999', name: 'Siswa Baru' })];
    const result = computeSyncDiff(rows, []);

    expect(result.toCreate).toHaveLength(1);
    expect(result.toCreate[0].nis).toBe('9999');
    expect(result.toUpdate).toHaveLength(0);
    expect(result.toGraduate).toHaveLength(0);
  });

  it('mendeteksi perpindahan kelas sebagai toUpdate ketika classId berbeda', () => {
    const rows = [
      row({
        nis: '0001',
        grade: 'XI',
        className: 'RPL 7',
        classId: 'class-xi-rpl-7',
      }),
    ];
    const existing = [activeStudent({ nis: '0001', classId: 'class-x-rpl-1' })];

    const result = computeSyncDiff(rows, existing);

    expect(result.toUpdate).toHaveLength(1);
    expect(result.toUpdate[0].fromClass).toBe('X RPL 1');
    expect(result.toUpdate[0].toClass).toBe('XI RPL 7');
    expect(result.toCreate).toHaveLength(0);
  });

  it('TIDAK melaporkan apa pun ketika kelas siswa persis sama (unchanged)', () => {
    const rows = [row({ nis: '0001', classId: 'class-x-rpl-1' })];
    const existing = [activeStudent({ nis: '0001', classId: 'class-x-rpl-1' })];

    const result = computeSyncDiff(rows, existing);

    expect(result.toCreate).toHaveLength(0);
    expect(result.toUpdate).toHaveLength(0);
    expect(result.toGraduate).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('siswa kelas XII yang tidak muncul di file masuk toGraduate, BUKAN warnings', () => {
    const rows: (SyncRow & { classId: string })[] = []; // file kosong
    const existing = [
      activeStudent({ nis: '0001', class: { grade: 'XII', name: 'RPL 1' } }),
    ];

    const result = computeSyncDiff(rows, existing);

    expect(result.toGraduate).toHaveLength(1);
    expect(result.toGraduate[0].toClass).toBe('LULUS');
    expect(result.warnings).toHaveLength(0);
  });

  it('siswa kelas X/XI yang tidak muncul di file masuk warnings, BUKAN toGraduate — tidak boleh dihapus otomatis', () => {
    const rows: (SyncRow & { classId: string })[] = [];
    const existing = [
      activeStudent({ nis: '0001', class: { grade: 'X', name: 'RPL 1' } }),
      activeStudent({ nis: '0002', class: { grade: 'XI', name: 'RPL 2' } }),
    ];

    const result = computeSyncDiff(rows, existing);

    expect(result.toGraduate).toHaveLength(0);
    expect(result.warnings).toHaveLength(2);
  });

  it('menangani skenario campuran (create + update + graduate + warning) sekaligus, sesuai kasus nyata yang sudah diuji manual', () => {
    const rows = [
      row({
        nis: '9999',
        name: 'Siswa Baru',
        grade: 'X',
        className: 'RPL 2',
        classId: 'class-x-rpl-2',
      }),
      row({
        nis: '0002',
        name: 'Naik Kelas',
        grade: 'XII',
        className: 'RPL 2',
        classId: 'class-xii-rpl-2',
      }),
    ];
    const existing = [
      activeStudent({
        nis: '0001',
        name: 'Lulus',
        class: { grade: 'XII', name: 'RPL 1' },
        classId: 'class-xii-rpl-1',
      }),
      activeStudent({
        nis: '0002',
        name: 'Naik Kelas',
        class: { grade: 'XI', name: 'RPL 4' },
        classId: 'class-xi-rpl-4',
      }),
      activeStudent({
        nis: '0003',
        name: 'Kelewat',
        class: { grade: 'X', name: 'RPL 3' },
        classId: 'class-x-rpl-3',
      }),
    ];

    const result = computeSyncDiff(rows, existing);

    expect(result.toCreate.map((i) => i.nis)).toEqual(['9999']);
    expect(result.toUpdate.map((i) => i.nis)).toEqual(['0002']);
    expect(result.toGraduate.map((i) => i.nis)).toEqual(['0001']);
    expect(result.warnings.map((w) => w.nis)).toEqual(['0003']);
  });
});
