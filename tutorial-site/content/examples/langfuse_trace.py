# Optional integration lab. Uses your own Langfuse project's environment keys.
# Only synthetic metadata is exported. No model call is made.
from langfuse import get_client

client = get_client()
try:
    with client.start_as_current_observation(as_type='span', name='synthetic-request'):
        with client.start_as_current_observation(as_type='span', name='demo-lookup') as lookup:
            invented_records = ['demo-1', 'demo-2']
            lookup.update(output={'record_count': len(invented_records)})
finally:
    client.flush()
