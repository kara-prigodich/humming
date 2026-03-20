import os
import requests
from datetime import datetime

# Use environment variables for API key and domain
API_KEY = os.getenv('FRESHSERVICE_API_KEY')
DOMAIN = os.getenv('FRESHSERVICE_DOMAIN')

# Get the current month and year
current_year = datetime.utcnow().year
current_month = datetime.utcnow().month

# Date filtering to get tickets created in the current month
start_date = f"{current_year}-{current_month:02d}-01"
end_date = f"{current_year}-{current_month + 1:02d}-01" if current_month < 12 else f"{current_year + 1}-01-01"

url = f"https://{DOMAIN}.freshservice.com/api/v2/tickets"
headers = {
    "Authorization": f"Basic {API_KEY}",
    "Content-Type": "application/json"
}

# Adding created_at filter to the request
params = {
    'created_at': f'[{start_date},{end_date}]'
}

response = requests.get(url, headers=headers, params=params)
tickets = response.json()

# The rest of the logic remains unchanged
