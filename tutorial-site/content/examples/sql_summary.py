import sqlite3

with sqlite3.connect(':memory:') as connection:
    connection.execute('CREATE TABLE scores (team TEXT, score REAL)')
    connection.executemany('INSERT INTO scores VALUES (?, ?)', [
        ('support', 3), ('support', 5), ('support', None), ('sales', 2)
    ])
    row = connection.execute(
        'SELECT team, AVG(score), COUNT(score), COUNT(*) '
        'FROM scores WHERE team = ? GROUP BY team', ('support',)
    ).fetchone()
    print(f'{row[0]}: average={row[1]:.1f}, known={row[2]}, rows={row[3]}')
