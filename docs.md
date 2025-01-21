Requirement Document: Business-Specific Chatbot
Objective
Develop a chatbot that engages users to gather comprehensive information about their business. Based on the collected data, the chatbot will generate outputs including, but not limited to:
Business Summary
Chatbot Prompt Generation
Flow and Function Data Structures (as needed)
If additional information is required during generation, the chatbot will dynamically request the necessary details from the user.

Functional Requirements
1. User Interaction
The chatbot must:
Engage the user in a conversational flow to collect detailed business information, including:
Business name
Purpose or mission
Products/services offered
Target audience
Unique selling points (USPs)
Operational processes
Dynamically adjust questions based on user responses to ensure completeness.
Validate and confirm user inputs to avoid ambiguity.
2. Data Structures
FlowData
The chatbot will use the following schema for any flow-related data:
class FlowData {
  @IsObject()
  data: {
    data: Array<{
      data: string;
      type: "text" | "image";
    }>;
    name: string;
    purpose: string;
    trigger_reason: string;
  };
}

// Images -> data mein URL 
// type → Text 
FunctionData
If a function is to be formed, the chatbot will ensure all properties are populated as follows:
class FunctionData {
  @IsObject()
  data: {
    name: string;
    purpose: string;
    trigger_reason: string;
    body: Record<string, any>;
    type: string;
    headers: Record<string, string>;
    req_url: string;
    req_type: string;
    variables: Array<{
      prop_name: string;
      prop_reason: string;
    }>;
  };
}
3. Output Generation
The chatbot will generate the following:
Business Summary:
A concise overview of the business based on user inputs.


Agent Prompt:
Custom prompt based on the collected business data to be used for interaction flows , chat and chat Finalization.
→ Prompt = We Will Generate that will be able to Simply Help the User to Perform QA
Flows and Functions:
If applicable, ensure that:
Properties in FlowData and FunctionData are fully populated.
Any missing information required for their generation is obtained from the user in real-time.
4. Dynamic Questioning
The chatbot will:
Detects missing information when generating any output (e.g., FlowData, FunctionData).
Prompt the user with specific questions to fill in the gaps.

Non-Functional Requirements
1. Scalability
The chatbot should be capable of handling multiple simultaneous user sessions.
2. Extensibility
Allow integration with future modules for additional data processing or output formats.
3. Usability
The conversational flow should be user-friendly and intuitive.
Provide clear and concise error messages or validation prompts when needed.

Technical Specifications
1. Platform
The chatbot will be deployed on a platform that supports dynamic flows (e.g., web, mobile, or messaging apps like WhatsApp).
2. Backend
Develop APIs for handling data storage, validation, and processing of FlowData and FunctionData structures.
3. Frontend
Design a responsive interface for user interaction if deployed as a web or mobile app.
4. Frameworks and Tools
Utilize TypeScript for data validation and structure enforcement.
Optional: Integrate with OpenAI or similar LLMs for enhanced conversational capabilities.
Deliverables
A fully functional chatbot capable of:
Collecting detailed business information.
Dynamically prompting for additional inputs when required.
Generating Business Summary, Chatbot Prompts, and relevant data structures.
Documentation:
API and schema documentation.
User manual for interacting with the chatbot.

Testing and Validation
Validate chatbot flows through user testing to ensure clarity and completeness.
Perform unit testing on backend logic to validate schema compliance.
Ensure output accuracy for Business Summary, FlowData, and FunctionData generation.

→ Step 1
= QA as Business Critical Agent. [10 Questions AT MAX ]
→ Step 2
 = Concurrent Actions : [ Business Summary , QA Prompt ] 


→ Step 3
= Chat History | [ Business Summary , QA Prompt ] ⇒ LLM ⇒ Flows [Flows End User] + Functions Data
Requirement Document: Business-Specific Chatbot
Objective
Develop a chatbot that engages users to gather comprehensive information about their business. Based on the collected data, the chatbot will generate outputs including, but not limited to:
Business Summary
Chatbot Prompt Generation
Flow and Function Data Structures (as needed)
If additional information is required during generation, the chatbot will dynamically request the necessary details from the user.

Functional Requirements
1. User Interaction
The chatbot must:
Engage the user in a conversational flow to collect detailed business information, including:
Business name
Purpose or mission
Products/services offered
Target audience
Unique selling points (USPs)
Operational processes
Dynamically adjust questions based on user responses to ensure completeness.
Validate and confirm user inputs to avoid ambiguity.
2. Data Structures
FlowData
The chatbot will use the following schema for any flow-related data:
class FlowData {
  @IsObject()
  data: {
    data: Array<{
      data: string;
      type: "text" | "image";
    }>;
    name: string;
    purpose: string;
    trigger_reason: string;
  };
}

// Images -> data mein URL 
// type → Text 
FunctionData
If a function is to be formed, the chatbot will ensure all properties are populated as follows:
class FunctionData {
  @IsObject()
  data: {
    name: string;
    purpose: string;
    trigger_reason: string;
    body: Record<string, any>;
    type: string;
    headers: Record<string, string>;
    req_url: string;
    req_type: string;
    variables: Array<{
      prop_name: string;
      prop_reason: string;
    }>;
  };
}
3. Output Generation
The chatbot will generate the following:
Business Summary:
A concise overview of the business based on user inputs.


Agent Prompt:
Custom prompt based on the collected business data to be used for interaction flows , chat and chat Finalization.
→ Prompt = We Will Generate that will be able to Simply Help the User to Perform QA
Flows and Functions:
If applicable, ensure that:
Properties in FlowData and FunctionData are fully populated.
Any missing information required for their generation is obtained from the user in real-time.
4. Dynamic Questioning
The chatbot will:
Detects missing information when generating any output (e.g., FlowData, FunctionData).
Prompt the user with specific questions to fill in the gaps.

Non-Functional Requirements
1. Scalability
The chatbot should be capable of handling multiple simultaneous user sessions.
2. Extensibility
Allow integration with future modules for additional data processing or output formats.
3. Usability
The conversational flow should be user-friendly and intuitive.
Provide clear and concise error messages or validation prompts when needed.

Technical Specifications
1. Platform
The chatbot will be deployed on a platform that supports dynamic flows (e.g., web, mobile, or messaging apps like WhatsApp).
2. Backend
Develop APIs for handling data storage, validation, and processing of FlowData and FunctionData structures.
3. Frontend
Design a responsive interface for user interaction if deployed as a web or mobile app.
4. Frameworks and Tools
Utilize TypeScript for data validation and structure enforcement.
Optional: Integrate with OpenAI or similar LLMs for enhanced conversational capabilities.
Deliverables
A fully functional chatbot capable of:
Collecting detailed business information.
Dynamically prompting for additional inputs when required.
Generating Business Summary, Chatbot Prompts, and relevant data structures.
Documentation:
API and schema documentation.
User manual for interacting with the chatbot.

Testing and Validation
Validate chatbot flows through user testing to ensure clarity and completeness.
Perform unit testing on backend logic to validate schema compliance.
Ensure output accuracy for Business Summary, FlowData, and FunctionData generation.

→ Step 1
= QA as Business Critical Agent. [10 Questions AT MAX ]
→ Step 2
 = Concurrent Actions : [ Business Summary , QA Prompt ] 


→ Step 3
= Chat History | [ Business Summary , QA Prompt ] ⇒ LLM ⇒ Flows [Flows End User] + Functions Data


