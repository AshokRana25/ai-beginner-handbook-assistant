# Optional integration lab using the MCPServer API documented for 2026-07-28.
# Install a compatible mcp SDK in an isolated environment and connect a client.
from mcp.server import MCPServer

server = MCPServer('invented-inventory')
STOCK = {'SKU-1': 5, 'SKU-2': 0}


@server.tool()
async def lookup_stock(sku: str) -> str:
    """Read the stock count for one SKU in the invented demo inventory."""
    if sku not in STOCK:
        raise ValueError('Unknown demo SKU')
    return f'{sku}: {STOCK[sku]} units'


if __name__ == '__main__':
    # Do not print logs to stdout: it carries protocol messages.
    server.run(transport='stdio')
