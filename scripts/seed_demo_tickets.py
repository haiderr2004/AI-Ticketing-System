import requests
import time
import json
import random

API_URL = "http://localhost:8000/tickets"

# Realistic IT Tickets
TICKETS = [
    # 5 Security (Critical/High)
    {"title": "Suspicious login attempt from unknown IP", "description": "I received an alert about a login from Russia, but I am in New York. Please investigate immediately.", "source": "email"},
    {"title": "Phishing email received from CEO", "description": "Got an email claiming to be the CEO asking for wire transfers. Attached the headers.", "source": "slack"},
    {"title": "Laptop stolen from car", "description": "My company laptop was stolen from my car last night. Need to wipe it remotely ASAP.", "source": "web_form"},
    {"title": "Malware detected by Windows Defender", "description": "Windows Defender quarantined a file called 'invoice.exe'. Not sure if my machine is compromised.", "source": "api"},
    {"title": "Ransomware note on shared drive", "description": "The accounting shared drive X: has a text file demanding bitcoin. Files end in .locked.", "source": "slack"},

    # 8 Infrastructure
    {"title": "VPN drops after Windows update KB5034441", "description": "Since deploying the Windows update KB5034441 this morning, approximately 40 users on the 3rd and 4th floors cannot maintain a stable VPN connection. The VPN client connects but drops after 2–3 minutes.", "source": "web_form"},
    {"title": "VPN connectivity issues — same as KB5034441", "description": "Since the update this morning my VPN keeps dropping every few minutes. I've tried restarting and reinstalling but the issue persists. About 10 other people on my floor have the same problem.", "source": "slack"}, # Intentional duplicate 1
    {"title": "VPN keeps dropping after update", "description": "My VPN drops every 5 minutes. I installed KB5034441 today.", "source": "email"}, # Intentional duplicate 2
    {"title": "Office Wi-Fi extremely slow", "description": "The guest Wi-Fi network in the Chicago office is crawling. Speedtest shows 2Mbps.", "source": "slack"},
    {"title": "Server rack 3 making grinding noise", "description": "There is a loud mechanical grinding noise coming from rack 3 in the main datacenter.", "source": "api"},
    {"title": "Jira is down", "description": "Cannot reach the Jira instance. Getting a 502 Bad Gateway error.", "source": "slack"},
    {"title": "Confluence is down 502", "description": "Atlassian stack seems to be down, getting 502 errors.", "source": "web_form"}, # Intentional duplicate 3
    {"title": "Cannot print to 4th floor printer", "description": "The printer says 'Load Paper' but it is full.", "source": "email"},

    # 7 Software Bugs
    {"title": "ERP system crashing on report generation", "description": "When I try to pull the Q3 financial report in the ERP, the application crashes entirely.", "source": "web_form"},
    {"title": "Mobile app push notifications broken", "description": "Users are reporting they no longer get push notifications on iOS 17.", "source": "github"},
    {"title": "Checkout page throwing 500 error", "description": "Customers cannot check out on the website. Urgent.", "source": "slack"},
    {"title": "Typo on homepage banner", "description": "The word 'Solutions' is misspelled as 'Solutons'.", "source": "github"},
    {"title": "Dark mode CSS is broken", "description": "The text is black on a dark gray background in the settings menu.", "source": "github"},
    {"title": "Forgot password link 404s", "description": "Clicking forgot password on the staging environment goes to a 404 page.", "source": "github"},
    {"title": "Memory leak in data pipeline", "description": "The nightly ETL job is consuming 64GB of RAM and getting OOM killed.", "source": "api"},

    # 5 Access Requests
    {"title": "Need Salesforce access for new hire", "description": "Please provision a Salesforce license for Sarah Jenkins starting Monday.", "source": "email"},
    {"title": "Request: AWS staging read access", "description": "I need read-only access to the staging AWS account to debug CloudWatch logs.", "source": "slack"},
    {"title": "GitHub repository permissions", "description": "Please add me as a maintainer to the 'frontend-v2' repository.", "source": "web_form"},
    {"title": "VPN Access for contractor", "description": "Need VPN credentials for an external contractor, David Smith, for 3 months.", "source": "email"},
    {"title": "Adobe Creative Cloud license", "description": "Marketing team needs one more Photoshop license.", "source": "web_form"},

    # 5 General Support
    {"title": "How do I update my email signature?", "description": "Is there a template I should use for the new company branding?", "source": "email"},
    {"title": "Monitor stand request", "description": "I would like to request a dual monitor stand for my desk.", "source": "web_form"},
    {"title": "Missing HDMI cable in conference room B", "description": "The projector in Room B cannot be used because the HDMI cable is missing.", "source": "slack"},
    {"title": "When is the next IT maintenance window?", "description": "Just checking if servers will be down this weekend.", "source": "email"},
    {"title": "Keyboard has sticky keys", "description": "My spacebar is sticking. Can I get a replacement keyboard?", "source": "web_form"},
]

def run():
    print(f"Starting seed script. Found {len(TICKETS)} tickets.")
    created_ids = []

    for i, t in enumerate(TICKETS):
        print(f"Creating ticket {i+1}/{len(TICKETS)}: {t['title']}")
        try:
            # We add a submitter name just for realism
            t["submitter_name"] = f"Demo User {random.randint(1, 100)}"
            t["submitter_email"] = f"user{random.randint(1, 100)}@example.com"
            
            res = requests.post(f"{API_URL}/", json=t)
            res.raise_for_status()
            created_ids.append(res.json()["id"])
            # Slight sleep to space out API calls to Claude if it's connected
            time.sleep(1.5)
        except Exception as e:
            print(f"Failed to create ticket: {e}")

    print("\nAll tickets submitted to the API. Waiting 15 seconds for background triage and duplicate detection to complete...")
    for i in range(15):
        time.sleep(1)
        print(".", end="", flush=True)
    print("\n")

    # Fetch stats
    try:
        metrics = requests.get("http://localhost:8000/analytics/metrics").json()
        triaged = int(metrics["triage_completion_rate"] * metrics["total_tickets"])
        duplicates = int(metrics["duplicate_rate"] * metrics["total_tickets"])
        
        print(f"\nSeed Complete Summary:")
        print(f"Total Tickets: {metrics['total_tickets']}")
        print(f"Triaged Successfully: {triaged}/{metrics['total_tickets']}")
        print(f"Duplicates Detected: {duplicates}")
        print(f"Critical/High Tickets: {metrics['critical_open_count']} critical, {metrics['high_priority_open_count']} high")
        print("Data is now ready for demo.")
    except Exception as e:
        print(f"Failed to fetch metrics: {e}")

if __name__ == "__main__":
    run()
