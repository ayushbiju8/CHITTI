from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, validator
from typing import Dict, Any, Optional, List
import ollama
import re
import logging
import uuid
from datetime import datetime, timedelta
from enum import IntEnum

# Mock function to simulate querying the RAG database
def query_ragdb(query: str) -> Optional[str]:
    """
    Simulates querying the RAG database for relevant authority phone numbers.
    Replace this with actual RAG database integration.
    """
    # Example dataset (replace with actual RAG database query)
    authority_data = {
        "police": "100",
        "fire": "101",
        "ambulance": "102",
        "cyber crime": "1930",
        "women helpline": "181",
        "child helpline": "1098",
    }
    
    # Search for the query in the dataset
    for key, value in authority_data.items():
        if key in query.lower():
            return f"For {key}, contact: {value}"
    
    return None

def retrieve_relevant_documents(query: str) -> List[str]:
    return []

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

class ResponseType(IntEnum):
    CONVERSATION = 0
    COMPLETED_COMPLAINT = 1
    WEBSITE_ISSUE = 2
    SCAM_CALL = 3
    DATA_BREACH = 4

class UserState(IntEnum):
    NORMAL = 0
    COMPLAINT_FLOW = 1
    AWAITING_CLARIFICATION = 2
    AWAITING_COMPLAINT_CONFIRMATION = 3
    WEBSITE_CHECK = 4
    SCAM_CALL_CHECK = 5
    DATA_BREACH_CHECK = 6

class UserQuery(BaseModel):
    text: str = Field(..., description="User input text")
    session_id: str = Field(..., description="Unique session identifier")

    @validator('session_id')
    def validate_session_id(cls, v):
        try:
            uuid.UUID(v)
            return v
        except ValueError:
            raise ValueError("Invalid session ID format. Must be a valid UUID.")

class ResponseModel(BaseModel):
    response_type: int = Field(..., description="Type of response")
    data: str = Field(..., description="Response content")

app = FastAPI(
    title="Complaint Filing API",
    description="API for handling user complaints and general chat interactions",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

user_sessions: Dict[str, Dict[str, Any]] = {}
session_expiry: Dict[str, datetime] = {}
SESSION_TIMEOUT = timedelta(minutes=30)

COMPLAINT_STEPS = {
    1: {"prompt": "Please enter your name.", "field": "Name"},
    2: {"prompt": "Please enter your phone number.", "field": "Phone", "validator": "phone"},
    3: {"prompt": "Please enter your address.", "field": "Address"},
    4: {"prompt": "Please describe your complaint in detail.", "field": "Complaint"},
}

COMPLAINT_TRIGGERS = {
    "file a complaint", "report a crime"
}

WEBSITE_TRIGGERS = {
    "website", "legit", "trust score", "report a website", "suspicious site", 
    "scam website", "fake website", "phishing site", "report site"
}

SCAM_CALL_TRIGGERS = {
    "scam call", "suspicious call", "spam call", "fraud call", "suspicious number",
    "scam number", "unknown caller", "unwanted call", "phishing call","number is scam"
}

def clean_expired_sessions():
    current_time = datetime.now()
    expired_sessions = [sid for sid, expiry in session_expiry.items() if current_time > expiry]
    
    for sid in expired_sessions:
        user_sessions.pop(sid, None)
        session_expiry.pop(sid, None)
    
    if expired_sessions:
        logger.info(f"Cleaned {len(expired_sessions)} expired sessions")

def update_session_expiry(session_id: str):
    session_expiry[session_id] = datetime.now() + SESSION_TIMEOUT

def format_response(response_type: ResponseType, data: str) -> ResponseModel:
    formatted_data = f"<Response>{response_type.value}</Response><data>{data}</data>"
    return ResponseModel(response_type=response_type.value, data=formatted_data)

def extract_phone_number(text: str) -> Optional[str]:
    cleaned_text = re.sub(r'\D', '', text)
    if len(cleaned_text) == 10:
        return f"{cleaned_text[:3]}-{cleaned_text[3:6]}-{cleaned_text[6:]}"
    return None

def is_complaint_intent(text: str) -> bool:
    text_lower = text.lower()
    return any(trigger in text_lower for trigger in COMPLAINT_TRIGGERS)

def is_website_intent(text: str) -> bool:
    text_lower = text.lower()
    return any(trigger in text_lower for trigger in WEBSITE_TRIGGERS)

def is_scam_call_intent(text: str) -> bool:
    text_lower = text.lower()
    return any(trigger in text_lower for trigger in SCAM_CALL_TRIGGERS)

def is_clear_response(text: str) -> bool:
    text_lower = text.lower().strip()
    if text_lower in {"yes", "no", "yeah", "nope", "sure", "definitely", "absolutely"}:
        return True
    uncertain_indicators = {"maybe", "i guess", "not sure", "possibly", "kind of", "sort of", "depends"}
    if any(indicator in text_lower for indicator in uncertain_indicators):
        return False
    if len(text_lower) < 3:
        return False
    return True

async def chat_with_ollama(query: str, session_id: str = None, optimize_complaint: bool = False) -> str:
    try:
        if optimize_complaint:
            system_prompt = """You are a customer service assistant specialized in optimizing complaint descriptions. 
            Take the user's complaint text and improve it by making it clearer, more concise, and professionally worded 
            while preserving all key details. Do not use emojis in responses. Provide only the optimized text without 
            additional commentary."""
        else:
            system_prompt = """You are CHITTI, an AI assistant here to provide guidance and help users register complaints and take actions against injustice. 
            Keep responses concise and friendly. If the user seems upset, be empathetic. Only guide them to file a complaint if they explicitly say 
            they want to 'file a complaint' or 'report a crime'. Do not use emojis in responses. Do not mention FAQs or talking to a representative."""

        messages = [{"role": "system", "content": system_prompt}]
        if session_id and session_id in user_sessions and "history" in user_sessions[session_id] and not optimize_complaint:
            history = user_sessions[session_id]["history"][-4:]
            messages.extend(history)
        
        messages.append({"role": "user", "content": query})
        
        response = ollama.chat(
            model="gemma2:2b", 
            messages=messages
        )
        
        response_text = response['message']['content'].strip()
        response_text = re.sub(r'[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF\U0001F1E0-\U0001F1FF]', '', response_text)
        
        # Remove unwanted lines like FAQs or representative suggestions
        unwanted_phrases = [
            "have you been able to find the information you need in our faqs",
            "would you like to talk with a representative",
            "visit our faq",
            "check our faq"
        ]
        for phrase in unwanted_phrases:
            response_text = re.sub(phrase, "", response_text, flags=re.IGNORECASE)
        
        # Clean up extra spaces or newlines
        response_text = re.sub(r'\s+', ' ', response_text).strip()
        
        if session_id and session_id in user_sessions and not optimize_complaint:
            if "history" not in user_sessions[session_id]:
                user_sessions[session_id]["history"] = []
            user_sessions[session_id]["history"].append({"role": "user", "content": query})
            user_sessions[session_id]["history"].append({"role": "assistant", "content": response_text})
            if len(user_sessions[session_id]["history"]) > 10:
                user_sessions[session_id]["history"] = user_sessions[session_id]["history"][-10:]
        
        return response_text
    except Exception as e:
        logger.error(f"Error in chat_with_ollama: {str(e)}")
        return "I'm having trouble connecting to my knowledge base. Can you please try again in a moment?" if not optimize_complaint else query

async def handle_complaint_step(session_id: str, user_input: str) -> ResponseModel:
    if session_id not in user_sessions:
        return format_response(ResponseType.CONVERSATION, "Something went wrong. Please start again.")

    user_data = user_sessions[session_id]
    step = user_data.get("step", 0)
    
    update_session_expiry(session_id)
    
    if user_input.lower() in ["cancel", "stop", "quit"]:
        user_data["state"] = UserState.NORMAL
        return format_response(
            ResponseType.CONVERSATION, 
            "Complaint process cancelled. How else can I help you today?"
        )
    
    if not is_clear_response(user_input) and "awaiting_clarification" not in user_data:
        user_data["awaiting_clarification"] = True
        user_data["last_prompt"] = f"I'm not sure I understood your response. Could you please answer more clearly? {COMPLAINT_STEPS.get(step, {}).get('prompt', '')}"
        return format_response(
            ResponseType.CONVERSATION,
            user_data["last_prompt"]
        )
    
    if "awaiting_clarification" in user_data:
        del user_data["awaiting_clarification"]
    
    if step == 0:
        user_data["step"] = 1
        user_data["data"] = {}
        user_data["state"] = UserState.COMPLAINT_FLOW
        return format_response(
            ResponseType.CONVERSATION, 
            "I'll help you file a report. " + COMPLAINT_STEPS[1]["prompt"]
        )
    
    if 1 <= step <= 4:
        step_info = COMPLAINT_STEPS[step]
        field_name = step_info["field"]
        
        if step == 2:
            logger.info(f"Received phone number input: {user_input}")
            phone_number = extract_phone_number(user_input)
            if phone_number:
                user_data["data"]["Phone"] = phone_number
            else:
                user_data["data"]["Phone"] = "Not provided"
                return format_response(
                    ResponseType.CONVERSATION,
                    "The phone number you entered is invalid. We'll proceed without it. " + 
                    COMPLAINT_STEPS[user_data["step"] + 1]["prompt"]
                )
            user_data["step"] += 1
            return format_response(
                ResponseType.CONVERSATION,
                COMPLAINT_STEPS[user_data["step"]]["prompt"]
            )
        
        if user_data.get("awaiting_complaint_confirmation", False):
            if user_input.lower() in ["yes", "yeah", "sure"]:
                user_data["step"] = step + 1
                user_data["awaiting_complaint_confirmation"] = False
                complaint_details = "\n".join([
                    f"{field}: {value}" 
                    for field, value in user_data["data"].items()
                ])
                complaint_details += f"\nSubmitted: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
                user_data["state"] = UserState.NORMAL
                del user_data["step"]
                del user_data["data"]
                return format_response(
                    ResponseType.COMPLETED_COMPLAINT, 
                    complaint_details
                )
            else:
                user_data["awaiting_complaint_confirmation"] = False
                return format_response(
                    ResponseType.CONVERSATION,
                    "Let's try again. " + step_info["prompt"]
                )
        
        if user_data.get("awaiting_confirmation", False):
            if user_input.lower() in ["yes", "yeah", "sure"]:
                if step == 4:
                    optimized_complaint = await chat_with_ollama(user_data["data"]["Complaint"], session_id, optimize_complaint=True)
                    user_data["data"]["Complaint"] = optimized_complaint
                    user_data["awaiting_confirmation"] = False
                    user_data["awaiting_complaint_confirmation"] = True
                    return format_response(
                        ResponseType.CONVERSATION,
                        f"Optimized complaint: {optimized_complaint}. Is this version acceptable?"
                    )
                user_data["step"] = step + 1
                user_data["awaiting_confirmation"] = False
                return format_response(
                    ResponseType.CONVERSATION,
                    COMPLAINT_STEPS[user_data["step"]]["prompt"]
                )
            else:
                user_data["awaiting_confirmation"] = False
                return format_response(
                    ResponseType.CONVERSATION,
                    "Let's try again. " + step_info["prompt"]
                )
        
        user_data["data"][field_name] = user_input
        user_data["awaiting_confirmation"] = True
        
        confirmation_prompt = f"You entered: {user_input}. Is this correct?"
        return format_response(
            ResponseType.CONVERSATION, 
            confirmation_prompt
        )
    
    return format_response(
        ResponseType.CONVERSATION, 
        "Something went wrong with the complaint process. Please start again."
    )

async def handle_website_check(session_id: str, user_input: str) -> ResponseModel:
    if session_id not in user_sessions:
        return format_response(ResponseType.CONVERSATION, "Something went wrong. Please start again.")
    
    # Reset the state and return the website URL in the expected format
    user_sessions[session_id]["state"] = UserState.NORMAL
    return format_response(
        ResponseType.WEBSITE_ISSUE,
        user_input
    )

async def handle_scam_call_check(session_id: str, user_input: str) -> ResponseModel:
    if session_id not in user_sessions:
        return format_response(ResponseType.CONVERSATION, "Something went wrong. Please start again.")

    # Reset the state and return the phone number in the expected format for scam call checking
    user_sessions[session_id]["state"] = UserState.NORMAL
    return format_response(
        ResponseType.SCAM_CALL,
        user_input
    )

def get_clean_sessions():
    clean_expired_sessions()
    return True

@app.post("/analyze-text/", response_model=ResponseModel)
async def analyze_text(data: UserQuery, _: bool = Depends(get_clean_sessions)):
    user_input = data.text.strip()
    session_id = data.session_id
    
    logger.info(f"Request received for session {session_id}")
    
    if session_id not in user_sessions:
        user_sessions[session_id] = {"state": UserState.NORMAL, "history": []}
        update_session_expiry(session_id)
    else:
        update_session_expiry(session_id)
    
    session_data = user_sessions[session_id]
    current_state = session_data.get("state", UserState.NORMAL)
    
    # Handle complaint flow
    if current_state in [UserState.COMPLAINT_FLOW, UserState.AWAITING_COMPLAINT_CONFIRMATION] or "step" in session_data:
        return await handle_complaint_step(session_id, user_input)
    
    # Handle website check state
    if current_state == UserState.WEBSITE_CHECK:
        return await handle_website_check(session_id, user_input)
    
    # Handle scam call check state
    if current_state == UserState.SCAM_CALL_CHECK:
        return await handle_scam_call_check(session_id, user_input)
    
    # Handle data breach check state
    if current_state == UserState.DATA_BREACH_CHECK:
        session_data["state"] = UserState.NORMAL
        return format_response(
            ResponseType.DATA_BREACH,
            user_input
        )
    
    # Process new intents
    if is_complaint_intent(user_input):
        session_data["state"] = UserState.COMPLAINT_FLOW
        session_data["step"] = 0
        return await handle_complaint_step(session_id, user_input)
    
    if is_website_intent(user_input):
        session_data["state"] = UserState.WEBSITE_CHECK
        return format_response(
            ResponseType.CONVERSATION,
            f"Please enter the website URL you want to check or report. You mentioned: {user_input}"
        )
    
    # Check for scam calls using the dedicated function
    if is_scam_call_intent(user_input):
        session_data["state"] = UserState.SCAM_CALL_CHECK
        return format_response(
            ResponseType.CONVERSATION,
            f"Please enter the phone number. You mentioned: {user_input}"
        )
    
    # Check for data breach
    if "data breach" in user_input.lower() or "leak" in user_input.lower() or "breach" in user_input.lower():
        session_data["state"] = UserState.DATA_BREACH_CHECK
        return format_response(
            ResponseType.CONVERSATION,
            f"Please enter your email ID to check for data breaches. You mentioned: {user_input}"
        )
    
    if session_data.get("awaiting_clarification", False):
        session_data["awaiting_clarification"] = False
        if "last_prompt" in session_data:
            return format_response(
                ResponseType.CONVERSATION,
                "Thank you for clarifying. " + session_data["last_prompt"]
            )
    
    # Check if the user is asking for help or authority contact
    if "help" in user_input.lower() or "contact" in user_input.lower() or "authority" in user_input.lower():
        authority_info = query_ragdb(user_input)
        if authority_info:
            return format_response(
                ResponseType.CONVERSATION,
                authority_info
            )
        else:
            return format_response(
                ResponseType.CONVERSATION,
                "I couldn't find relevant contact information. Please provide more details."
            )
    
    ai_response = await chat_with_ollama(user_input, session_id)
    return format_response(ResponseType.CONVERSATION, ai_response)

@app.get("/health")
async def health_check():
    active_sessions = len(user_sessions)
    complaint_sessions = sum(1 for s in user_sessions.values() if s.get("state") == UserState.COMPLAINT_FLOW)
    
    return {
        "status": "healthy", 
        "active_sessions": active_sessions,
        "complaint_sessions": complaint_sessions,
        "version": "1.0.0"
    }

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)
    return {"error": "An unexpected error occurred. Please try again."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)