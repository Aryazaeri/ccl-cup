"""Real concurrent RPC transactions; disposable local Supabase only."""
import concurrent.futures
import json
import os
from pathlib import Path
import re
import subprocess
import uuid

root = Path(os.environ['CCL_TEST_WORKDIR'])
assert not (root / 'supabase/.temp/project-ref').exists()
project = re.search(r'^project_id = "(ccl_[^"]+)"', (root / 'supabase/config.toml').read_text(), re.M).group(1)
container = 'supabase_db_' + project
status = json.loads(subprocess.check_output(['supabase','status','--workdir',str(root),'-o','json'], stderr=subprocess.DEVNULL))
assert re.match(r'^http://(127\.0\.0\.1|localhost):\d+$', status['API_URL'])

def sql(value):
    return subprocess.run(['docker','exec','-i',container,'psql','-U','postgres','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1'], input=value, text=True, capture_output=True, timeout=15)

original = json.loads(sql("select coalesce(json_agg(id),'[]') from profiles where role='super_admin'").stdout)
assert original, 'Prepare synthetic baseline super-admin accounts first'
temporary = [str(uuid.uuid4()), str(uuid.uuid4())]
quoted = lambda items: ','.join("'" + item + "'" for item in items)
try:
    setup = sql("begin; insert into auth.users(id,raw_user_meta_data) values " + ','.join("('"+item+"','{\"full_name\":\"Concurrent role test\"}')" for item in temporary) +
        "; update profiles set role='super_admin' where id in ("+quoted(temporary)+"); update profiles set role='viewer' where id in ("+quoted(original)+"); commit;")
    assert setup.returncode == 0, setup.stderr
    def demote(person):
        return sql("begin; set local role authenticated; set local request.jwt.claims='"+json.dumps({'sub':person,'role':'authenticated'})+"'; select set_user_role('"+person+"','viewer'); select pg_sleep(0.2); commit;")
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(demote, temporary))
    assert sorted(r.returncode == 0 for r in results) == [False,True], 'Exactly one concurrent last-super demotion must succeed'
    assert 'At least one super admin' in next(r.stderr for r in results if r.returncode), 'Expected last-super safeguard'
    assert sql("select count(*) from profiles where role='super_admin'").stdout.strip() == '1'
    print('PASS concurrent RPC demotions retain exactly one super admin')
finally:
    restored = sql("begin; update profiles set role='super_admin' where id in ("+quoted(original)+"); delete from auth.users where id in ("+quoted(temporary)+"); commit;")
    assert restored.returncode == 0, restored.stderr
    assert json.loads(sql("select json_agg(id order by id) from profiles where role='super_admin'").stdout) == sorted(original)
    print('PASS synthetic baseline roles restored; temporary Auth accounts removed')
